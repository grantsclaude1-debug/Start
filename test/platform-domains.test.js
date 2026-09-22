import test from 'node:test';
import assert from 'node:assert/strict';
import { GiftCardLedger } from '../src/domain/gift-card-ledger.js';
import { ImportCenter, neutralizeFormula, parseCsv } from '../src/imports/import-center.js';
import { ConnectorRegistry } from '../src/integrations/connector-registry.js';

test('gift-card ledger is append-only, hash chained, integer-only, and idempotent', () => {
  const ledger = new GiftCardLedger();
  const issue = ledger.append({ cardId: 'GC-SYN', type: 'ISSUED', amountMinor: 5000, idempotencyKey: 'issue', occurredAt: '2030-01-01T00:00:00Z' });
  const replay = ledger.append({ cardId: 'GC-SYN', type: 'ISSUED', amountMinor: 5000, idempotencyKey: 'issue', occurredAt: '2030-02-01T00:00:00Z' });
  assert.equal(replay.hash, issue.hash);
  ledger.append({ cardId: 'GC-SYN', type: 'REDEEMED', amountMinor: -1200, idempotencyKey: 'redeem', occurredAt: '2030-01-02T00:00:00Z' });
  assert.equal(ledger.balance('GC-SYN'), 3800);
  assert.equal(ledger.verify(), true);
  assert.equal(ledger.entries().length, 2);
  assert.throws(() => ledger.append({ cardId: 'GC-SYN', type: 'ADJUSTED', amountMinor: 1.5, idempotencyKey: 'float' }), { code: 'VALIDATION_FAILED' });
  assert.throws(() => ledger.append({ cardId: 'GC-SYN', type: 'REDEEMED', amountMinor: -5000, idempotencyKey: 'overdraw' }), { code: 'INSUFFICIENT_GIFT_CARD_BALANCE' });
  assert.throws(() => ledger.append({ cardId: 'GC-SYN', type: 'ISSUED', amountMinor: 6000, idempotencyKey: 'issue' }), { code: 'IDEMPOTENCY_MISMATCH' });
});

test('CSV parser is deterministic and neutralizes spreadsheet formulas', () => {
  const rows = parseCsv('sourceId,name,priceMinor\np-1,"Synthetic, pass",2500\np-2,=1+1,3000\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Synthetic, pass');
  assert.equal(neutralizeFormula(rows[1].name), "'=1+1");
  assert.throws(() => parseCsv('sourceId,name\n' + Array.from({ length: 501 }, (_, i) => `${i},x`).join('\n')), { code: 'INVALID_IMPORT' });
});

test('import preview, mapping, dry-run history, errors, and idempotency are deterministic', () => {
  const center = new ImportCenter();
  const content = JSON.stringify([{ id: 'p-1', label: 'Synthetic pass', cents: 2500 }, { id: '', label: '=bad', cents: 1.2 }]);
  const mapping = { sourceId: 'id', name: 'label', priceMinor: 'cents' };
  const preview = center.preview({ entity: 'products', format: 'json', content, mapping });
  assert.equal(preview.rowCount, 2);
  assert.equal(preview.validCount, 1);
  assert.equal(preview.errorCount, 1);
  assert.equal(preview.rows[1].record.name, "'=bad");
  const first = center.createJob({ entity: 'products', format: 'json', content, mapping, dryRun: true, idempotencyKey: 'job-1', createdAt: '2030-01-01T00:00:00Z' });
  const replay = center.createJob({ entity: 'products', format: 'json', content, mapping, dryRun: true, idempotencyKey: 'job-1', createdAt: '2030-01-02T00:00:00Z' });
  assert.equal(replay.id, first.id);
  assert.equal(center.history().length, 1);
  assert.equal(first.providerCalls, 0);
  assert.equal(first.writeback, false);
});

test('connectors simulate retry, mapping, token, partial, and empty states with zero provider calls', () => {
  const registry = new ConnectorRegistry({ now: () => '2030-01-01T00:00:00.000Z' });
  for (const [scenario, expected] of [['rate_limited','RETRY_QUEUED'],['mapping_error','NEEDS_MAPPING'],['token_expired','AUTH_BLOCKED'],['partial_batch','PARTIAL'],['empty','EMPTY'],['healthy','READY_LOCAL']]) {
    const state = registry.run('roller', scenario);
    assert.equal(state.status, expected);
    assert.equal(state.providerCalls, 0);
  }
  assert.equal(registry.list().find((item) => item.id === 'stripe').mode, 'DISABLED');
  assert.ok(registry.list().every((item) => item.providerCalls === 0));
});
