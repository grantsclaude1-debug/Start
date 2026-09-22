import test from 'node:test';
import assert from 'node:assert/strict';
import { CapacityPool, HoldStore } from '../src/domain/capacity.js';
import { AdmissionRegistry, generateTicketSigningKeyPair, TicketTokenService } from '../src/domain/tickets.js';
import { AtomicCheckoutService } from '../src/domain/checkout.js';
import { DomainEventLog, ExceptionCaseStore } from '../src/domain/operations.js';
import { Outbox } from '../src/offline/outbox.js';
import { FakePaymentProvider } from '../src/payments/fake-provider.js';
import { ControlledClock, DeterministicJobRunner } from '../src/time/controlled-clock.js';
import { ImportCenter } from '../src/imports/import-center.js';
import { ConnectorRegistry } from '../src/integrations/connector-registry.js';
import { ExportJobStore, exportReport } from '../src/reporting/reports.js';

function checkoutFixture() {
  const clock = new ControlledClock('2030-06-01T12:00:00Z');
  const holds = new HoldStore({ now: clock.now }); const pool = holds.addPool(new CapacityPool({ id: 'pool', tenantId: 'tenant', venueId: 'venue', sessionId: 'session', capacityTotal: 1 }));
  holds.createHold({ id: 'hold', poolId: pool.id, quantity: 1, expiresAt: clock.now() + 60_000, idempotencyKey: 'hold-create' });
  const { privateKey, publicKey } = generateTicketSigningKeyPair(); const tokens = new TicketTokenService({ privateKey, publicKeys: new Map([['local', publicKey]]), keyId: 'local', now: clock.now });
  const admissions = new AdmissionRegistry(); const outbox = new Outbox({ originId: 'local', now: () => new Date(clock.now()) }); const paymentProvider = new FakePaymentProvider({ now: clock.iso });
  const checkout = new AtomicCheckoutService({ holds, tokens, admissions, outbox, paymentProvider, now: clock.now });
  return { clock, holds, pool, admissions, outbox, checkout };
}

test('final capacity contention allows exactly one hold and never becomes negative', async () => {
  const store = new HoldStore({ now: () => 1_000 }); const pool = store.addPool(new CapacityPool({ id: 'p', tenantId: 't', venueId: 'v', sessionId: 's', capacityTotal: 1 }));
  const commands = ['a', 'b'].map((id) => Promise.resolve().then(() => store.createHold({ id, poolId: 'p', quantity: 1, expiresAt: 2_000, idempotencyKey: id })));
  const results = await Promise.allSettled(commands);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1); assert.equal(results.filter((item) => item.reason?.code === 'CAPACITY_UNAVAILABLE').length, 1); assert.equal(pool.available, 0); assert.ok(pool.available >= 0);
});

test('hold expiry versus consume race has one terminal result and preserves capacity', async () => {
  const store = new HoldStore({ now: () => 2_000 }); const pool = store.addPool(new CapacityPool({ id: 'p', tenantId: 't', venueId: 'v', sessionId: 's', capacityTotal: 1 }));
  store.now = () => 1_000; store.createHold({ id: 'h', poolId: 'p', quantity: 1, expiresAt: 2_000, idempotencyKey: 'create' }); store.now = () => 2_000;
  const results = await Promise.allSettled([Promise.resolve().then(() => store.transition({ holdId: 'h', action: 'EXPIRE', expectedVersion: 1, idempotencyKey: 'expire' })), Promise.resolve().then(() => store.transition({ holdId: 'h', action: 'CONSUME', expectedVersion: 1, idempotencyKey: 'consume', orderId: 'o' }))]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1); assert.equal(store.holds.get('h').status, 'EXPIRED'); assert.equal(pool.available, 1); assert.ok(pool.available >= 0);
});

test('checkout rolls back hold, order, ticket, admission, outbox, and audit under every injected boundary', async () => {
  for (const boundary of ['payment', 'hold', 'ticket', 'outbox', 'audit']) {
    const { checkout, holds, pool, admissions, outbox } = checkoutFixture();
    await assert.rejects(checkout.confirm({ holdId: 'hold', product: { id: 'product', priceMinor: 2500, currency: 'USD' }, idempotencyKey: boundary, injectFailureAt: boundary }), { code: 'INJECTED_ATOMIC_FAILURE' });
    assert.equal(holds.holds.get('hold').status, 'ACTIVE', boundary); assert.equal(pool.activeHolds, 1, boundary); assert.equal(pool.confirmed, 0, boundary); assert.equal(checkout.orders.length, 0, boundary); assert.equal(checkout.tickets.length, 0, boundary); assert.equal(admissions.tickets.size, 0, boundary); assert.equal(outbox.events.length, 0, boundary); assert.equal(checkout.audit.length, 0, boundary);
  }
});

test('fake payment scenarios use exact stored-versus-paid language and no provider calls', async () => {
  const provider = new FakePaymentProvider({ now: () => '2030-01-01T00:00:00Z' });
  const stored = await provider.createOrReusePaymentAttempt({ idempotencyKey: 'one', orderId: 'o', amountMinor: 100, scenario: 'stored' });
  const paid = await provider.createOrReusePaymentAttempt({ idempotencyKey: 'two', orderId: 'o2', amountMinor: 100, scenario: 'paid' });
  assert.equal(stored.language, 'Stored for authorization — not paid'); assert.equal(stored.paid, false); assert.equal(paid.language, 'Paid'); assert.equal(paid.paid, true); assert.equal(provider.providerCalls, 0);
});

test('controlled clock deterministically runs hold, report, and retry-style jobs', () => {
  const clock = new ControlledClock('2030-01-01T00:00:00Z'); const runner = new DeterministicJobRunner({ clock }); const effects = [];
  runner.schedule({ id: 'hold', kind: 'hold-expiry', runAt: '2030-01-01T00:01:00Z' }); runner.schedule({ id: 'report', kind: 'report-progress', runAt: '2030-01-01T00:02:00Z' }); runner.schedule({ id: 'retry', kind: 'connector-retry', runAt: '2030-01-01T00:03:00Z' });
  clock.advance(180_000); const complete = runner.runDue({ 'hold-expiry': () => effects.push('hold'), 'report-progress': () => effects.push('report'), 'connector-retry': () => effects.push('retry') });
  assert.deepEqual(effects, ['hold', 'report', 'retry']); assert.ok(complete.every((job) => job.status === 'COMPLETED'));
});

test('Import Center supports all templates, explicit ignores, dry-run zero mutation, synthetic atomic commit, reconciliation, and abuse rejection', () => {
  const center = new ImportCenter(); assert.deepEqual(center.templates().map((item) => item.id), ['products','sessions','orders','tickets','customers','memberships','giftCards','inventoryReferences','waivers','checkIns']);
  const content = 'source,name,cents,unused\np-1,Synthetic pass,2500,ignore me\n'; const upload = center.upload({ entity: 'products', format: 'csv', content, provenance: 'fixture-suite', sourceVersion: '1' });
  assert.throws(() => center.createMapping({ uploadId: upload.id, fields: { sourceId: 'source', name: 'name', priceMinor: 'cents' } }), { code: 'IMPORT_UNKNOWN_FIELD_REQUIRES_IGNORE' });
  const mapping = center.createMapping({ uploadId: upload.id, fields: { sourceId: 'source', name: 'name', priceMinor: 'cents' }, transforms: { priceMinor: 'INTEGER' }, ignored: ['unused'] });
  const dry = center.createJobFromUpload({ uploadId: upload.id, mappingId: mapping.id, mode: 'DRY_RUN', idempotencyKey: 'dry' }); assert.equal(dry.status, 'DRY_RUN_COMPLETE'); assert.equal(center.records('products').length, 0);
  assert.throws(() => center.createJobFromUpload({ uploadId: upload.id, mappingId: mapping.id, mode: 'COMMIT', idempotencyKey: 'real', synthetic: false }), { code: 'REAL_DATA_COMMIT_DISABLED' });
  assert.throws(() => center.createJobFromUpload({ uploadId: upload.id, mappingId: mapping.id, mode: 'COMMIT', idempotencyKey: 'fail', injectFailureAt: 0 }), { code: 'INJECTED_IMPORT_FAILURE' }); assert.equal(center.records('products').length, 0);
  const committed = center.createJobFromUpload({ uploadId: upload.id, mappingId: mapping.id, mode: 'COMMIT', idempotencyKey: 'commit' }); assert.equal(committed.status, 'COMMITTED_SYNTHETIC'); assert.equal(center.records('products').length, 1); assert.equal(center.reconciliation(committed.id).balanced, true);
  const changed = center.upload({ entity: 'products', format: 'json', content: '[{"sourceId":"p-2","name":"Synthetic","priceMinor":1}]', provenance: 'fixture-suite', sourceVersion: '1' }); const changedMap = center.createMapping({ uploadId: changed.id, fields: { sourceId: 'sourceId', name: 'name', priceMinor: 'priceMinor' } }); assert.throws(() => center.createJobFromUpload({ uploadId: changed.id, mappingId: changedMap.id, mode: 'DRY_RUN', idempotencyKey: 'changed' }), { code: 'IMPORT_PROVENANCE_HASH_CONFLICT' });
  for (const bad of ['[{"sourceId":"x","reference":"person@example.com"}]','[{"sourceId":"x","reference":"4242 4242 4242 4242"}]','[{"sourceId":"x","reference":"access_token=abcdef123456"}]']) { const item = center.upload({ entity: 'customers', format: 'json', content: bad, provenance: `abuse-${bad.length}-${bad.slice(-3)}` }); const map = center.createMapping({ uploadId: item.id, fields: { sourceId: 'sourceId', reference: 'reference' } }); assert.equal(center.validate(item.id, map.id).errorCount, 1); }
});

test('CSV-like report cells neutralize formulas and export jobs progress without downloads', () => {
  const row = { service_date: '2030-01-01', product_id: '=cmd()', session_id: 's', channel: 'SYNTHETIC', tickets_sold: 1, gross_minor: 1, refunded_minor: 0, net_minor: 1, currency: 'USD' };
  assert.match(exportReport({ reportId: 'ticket_sales', rows: [row], format: 'csv' }).bytes.toString(), /'=cmd\(\)/);
  const jobs = new ExportJobStore({ now: () => '2030-01-01T00:00:00Z' }); const queued = jobs.create({ reportId: 'ticket_sales', idempotencyKey: 'e' }); assert.equal(queued.downloadable, false); assert.equal(jobs.progress(queued.id, 'RUNNING').status, 'RUNNING'); const rendered = jobs.progress(queued.id, 'RENDERED'); assert.equal(rendered.status, 'RENDERED'); assert.equal(rendered.downloadable, false);
});

test('integration kernel makes LIVE unreachable, fails unsupported capabilities before I/O, and records immutable local lifecycle facts', () => {
  const registry = new ConnectorRegistry({ now: () => '2030-01-01T00:00:00Z' }); assert.ok(registry.list().some((item) => item.id === 'genericWebhooks' && item.mode === 'DISABLED')); assert.ok(registry.list().every((item) => item.credentials.valuePresent === false));
  assert.throws(() => registry.command({ connectionId: 'stripe', capability: 'payment.fixture', mode: 'LIVE', idempotencyKey: 'live' }), { code: 'INTEGRATION_MODE_UNREACHABLE' });
  assert.throws(() => registry.command({ connectionId: 'stripe', capability: 'generic.request', idempotencyKey: 'proxy' }), { code: 'INTEGRATION_CAPABILITY_UNSUPPORTED' });
  const command = registry.command({ connectionId: 'stripe', capability: 'payment.fixture', mode: 'FIXTURE', payload: { amountMinor: 100 }, idempotencyKey: 'fixture' }); const rendered = registry.renderCommand(command.id); assert.deepEqual(rendered.lifecycle, ['DRAFT','VALIDATED','DRY_RUN_QUEUED','RENDERED']); const records = registry.records('stripe'); assert.equal(records.attempts[0].providerCalls, 0); assert.equal(records.acknowledgements[0].providerCalls, 0); assert.equal(records.reconciliations.at(-1).balanced, true);
});

test('domain events and exception cases are append-only and hash-verifiable', () => {
  const events = new DomainEventLog({ now: () => '2030-01-01T00:00:00Z' }); const exceptions = new ExceptionCaseStore({ now: () => '2030-01-01T00:00:00Z', events }); exceptions.open({ type: 'ADMISSION', sourceType: 'Ticket', sourceId: 't', summary: 'Duplicate admission' }); assert.equal(events.verify(), true); assert.equal(events.list()[0].type, 'EXCEPTION_OPENED'); assert.equal(exceptions.list()[0].status, 'OPEN');
});
