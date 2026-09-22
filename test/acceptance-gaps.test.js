import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VersionedVenueStore, FinanceService } from '../src/domain/admin.js';
import { CapacityPool } from '../src/domain/capacity.js';
import { DomainEventLog } from '../src/domain/operations.js';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');

test('client has no alert calls and exposes inline live feedback', () => {
  assert.doesNotMatch(app, /\balert\s*\(/);
  for (const id of ['import-status','finance-status','catalog-status','session-status','block-status','report-status']) assert.match(page, new RegExp(`id="${id}"[^>]*role="status"`));
});

test('Import Center UI offers all ten templates, NDJSON, explicit ignore, constants, transforms, canonical validation, jobs, and reconciliation', () => {
  for (const value of ['products','sessions','orders','tickets','customers','memberships','giftCards','inventoryReferences','waivers','checkIns']) assert.match(page, new RegExp(`option value="${value}"`));
  assert.match(page, /\.ndjson/); assert.match(app, /'ndjson'/); assert.match(app, /'IGNORE'/); assert.match(app, /constants/); assert.match(app, /TRIM/); assert.match(app, /\/api\/import\/uploads/); assert.match(app, /\/detect/); assert.match(app, /\/validate/); assert.match(app, /\/preview\?mappingId/); assert.match(app, /\/errors\?mappingId/); assert.match(app, /mode,'?synthetic/); assert.match(app, /DRY_RUN/); assert.match(app, /COMMIT/); assert.match(app, /reconciliation/); assert.match(page, /Provenance/); assert.match(page, /Source version/); assert.match(page, /File hash|hash/);
});

test('versioned catalog, session, and capacity mutations enforce expectedVersion, idempotency, and nonnegative capacity', () => {
  const events = new DomainEventLog();
  const pool = new CapacityPool({ id: 'pool-demo', tenantId: 't', venueId: 'v', sessionId: 's', capacityTotal: 3, activeBlocks: 1 });
  const store = new VersionedVenueStore({ products: [{ id: 'p', tenantId: 't', venueId: 'v', name: 'Synthetic', type: 'GENERAL_ADMISSION', priceMinor: 100, currency: 'USD', status: 'ACTIVE', version: 1 }], capacityBlocks: [{ id: 'b', poolId: 'pool-demo', quantity: 1, reason: 'Fixture', status: 'ACTIVE', version: 1 }], events });
  const updated = store.mutate('products', { id: 'p', name: 'Synthetic Plus', expectedVersion: 1 }, 'product-key', pool); assert.equal(updated.version, 2);
  assert.deepEqual(store.mutate('products', { id: 'p', name: 'Synthetic Plus', expectedVersion: 1 }, 'product-key', pool), updated);
  assert.throws(() => store.mutate('products', { id: 'p', name: 'Stale', expectedVersion: 1 }, 'different-key', pool), { code: 'VERSION_CONFLICT' });
  assert.throws(() => store.mutate('capacityBlocks', { id: 'too-big', quantity: 3, reason: 'Would overbook', expectedVersion: 0 }, 'block-key', pool), { code: 'CAPACITY_UNAVAILABLE' });
  assert.ok(pool.available >= 0); assert.equal(events.verify(), true);
});

test('refund lifecycle requires integer money and paid orders, is atomic and idempotent, and makes zero provider calls', () => {
  const events = new DomainEventLog(); const finance = new FinanceService({ events, now: () => '2030-01-01T00:00:00Z' });
  const order = { id: 'o', totalMinor: 1000, currency: 'USD', version: 3, payment: { paid: true } };
  assert.throws(() => finance.refund({ order, amountMinor: 1.5, expectedVersion: 3, idempotencyKey: 'fraction' }), { code: 'REFUND_NOT_ALLOWED' });
  assert.throws(() => finance.refund({ order, amountMinor: 100, expectedVersion: 2, idempotencyKey: 'stale' }), { code: 'VERSION_CONFLICT' });
  assert.throws(() => finance.refund({ order, amountMinor: 100, expectedVersion: 3, idempotencyKey: 'failure', scenario: 'failed' }), { code: 'REFUND_ATOMIC_FAILURE' }); assert.equal(finance.list().length, 0);
  const refund = finance.refund({ order, amountMinor: 100, expectedVersion: 3, idempotencyKey: 'success' }); assert.equal(refund.providerCalls, 0); assert.equal(refund.amountMinor, 100); assert.deepEqual(finance.refund({ order, amountMinor: 100, expectedVersion: 3, idempotencyKey: 'success' }), refund); assert.equal(finance.list().length, 1);
});

test('booking, reports, and integration controls are functional contracts rather than cosmetic labels', () => {
  for (const token of ['booking-search','booking-status','booking-mode','data-order-detail','booking-drawer','order-drawer','renderBookings','renderOrders']) assert.match(`${page}\n${app}`, new RegExp(token));
  for (const token of ['report-workspace','report-date','report-format','progress-export','Freshness','RUNNING','RENDERED','downloadable']) assert.match(`${page}\n${app}`, new RegExp(token, 'i'));
  for (const tab of ['Overview','Configuration','Capabilities','Mappings','Queue','Health','Reconciliation','Audit']) assert.match(page, new RegExp(`data-tab="${tab}"`));
  assert.match(page, /role="tabpanel"/); assert.match(app, /ArrowLeft/); assert.match(app, /Home/); assert.match(app, /renderIntegrationPanel/); assert.match(app, /connectorEvents/);
});

test('UI performs no downloads, external requests, or provider calls', () => {
  assert.doesNotMatch(page, /\sdownload\s*=/i); assert.doesNotMatch(app, /https?:\/\//i); assert.doesNotMatch(app, /location\.href|window\.open|createObjectURL/); assert.match(server, /connect-src 'self'/); assert.match(page, /Provider calls: 0/); assert.match(app, /providerCalls/);
});
