import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YellowDogAdapter,
  YellowDogInventoryMirror,
  YellowDogRateLimitScheduler,
  YellowDogSalesOutbox,
} from '../src/integrations/yellow-dog.js';

class DurableRepository {
  durability = 'durable';
  rows = new Map();

  async putIfAbsent(key, value) {
    const existing = this.rows.get(key);
    if (existing) return { inserted: false, value: existing };
    this.rows.set(key, value);
    return { inserted: true, value };
  }
}

const finalizedSale = {
  transactionId: 'sale-100',
  lifecycle: 'completed',
  storeId: 'store-1',
  lines: [{ lineId: 'line-1', itemId: 'item-1', quantity: 1 }],
};

function enabledAdapter(repository = new DurableRepository()) {
  const salesOutbox = new YellowDogSalesOutbox({
    repository,
    now: () => new Date('2026-09-18T20:00:00.000Z'),
    id: () => 'outbox-1',
  });
  return new YellowDogAdapter({
    enabled: true,
    vendorVerified: true,
    certifiedReads: ['items', 'onHand'],
    certifiedWrites: ['sales', 'items', 'transfers'],
    salesOutbox,
  });
}

test('Yellow Dog capabilities require activation and certification and keep unverified writes disabled', async () => {
  const disabled = new YellowDogAdapter();
  assert.equal(disabled.capabilities().inventoryAuthority, 'yellow-dog');
  assert.equal(disabled.capabilities().localInventoryRole, 'integration-owned-read-only-mirror');
  assert.equal(disabled.capabilities().writes.sales, false);
  await assert.rejects(disabled.enqueueFinalizedSale(finalizedSale, { idempotencyKey: 'sale-100' }), { code: 'INVENTORY_WRITE_DISABLED' });

  const enabled = enabledAdapter();
  const capabilities = enabled.capabilities();
  assert.deepEqual({ items: capabilities.reads.items, onHand: capabilities.reads.onHand, vendors: capabilities.reads.vendors }, { items: true, onHand: true, vendors: false });
  assert.equal(capabilities.writes.sales, true);
  for (const capability of ['items', 'vendors', 'purchaseOrders', 'receipts', 'receiptCommit', 'counts', 'waste', 'manualAdjustments', 'recipes', 'transfers']) {
    assert.equal(capabilities.writes[capability], false, `${capability} must remain disabled`);
  }
  await assert.rejects(enabled.writeUnverifiedCapability('transfers', {}), { code: 'INVENTORY_WRITE_DISABLED' });
});

test('local inventory projection is an integration-owned read-only mirror of Yellow Dog facts', () => {
  const mirror = new YellowDogInventoryMirror({ now: () => new Date('2026-09-18T20:00:00.000Z') });
  assert.deepEqual(mirror.semantics(), {
    authority: 'yellow-dog',
    owner: 'local-integration',
    mode: 'read-only-mirror',
    absenceMeansDeleted: false,
    checkoutDependency: false,
  });
  mirror.applySourceRecords('items', [{ id: 'item-1', name: 'Hard Hat', onHand: 4 }]);
  mirror.applySourceRecords('items', [{ id: 'item-2', name: 'Vest', onHand: 2 }]);
  assert.equal(mirror.get('items', 'item-1').name, 'Hard Hat', 'incremental absence must not delete an existing source fact');
  assert.deepEqual(mirror.get('items', 'item-2').mirror, {
    source: 'yellow-dog', authoritative: false, readOnly: true, syncedAt: '2026-09-18T20:00:00.000Z',
  });
  assert.throws(() => mirror.write('items', {}), { code: 'INVENTORY_MIRROR_READ_ONLY' });
  assert.throws(() => mirror.deleteMissing('items', []), { code: 'INVENTORY_SOURCE_DELETION_UNVERIFIED' });
});

test('sales outbox deduplicates identical payloads and rejects an idempotency-key collision', async () => {
  const repository = new DurableRepository();
  const adapter = enabledAdapter(repository);
  const first = await adapter.enqueueFinalizedSale(finalizedSale, { idempotencyKey: 'sale-100' });
  const identicalWithDifferentKeyOrder = { lifecycle: 'completed', lines: [{ quantity: 1, itemId: 'item-1', lineId: 'line-1' }], storeId: 'store-1', transactionId: 'sale-100' };
  const duplicate = await adapter.enqueueFinalizedSale(identicalWithDifferentKeyOrder, { idempotencyKey: 'sale-100' });
  assert.equal(first.queued, true);
  assert.equal(duplicate.queued, false);
  assert.equal(duplicate.entry.outboxId, first.entry.outboxId);
  assert.equal(repository.rows.size, 1);

  await assert.rejects(
    adapter.enqueueFinalizedSale({ ...finalizedSale, lines: [{ ...finalizedSale.lines[0], quantity: 2 }] }, { idempotencyKey: 'sale-100' }),
    { code: 'IDEMPOTENCY_MISMATCH' },
  );
  assert.equal(repository.rows.size, 1);
});

test('finalized sale submission is asynchronous queueing rather than inline delivery', async () => {
  let release;
  let writeStarted = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const repository = {
    durability: 'durable',
    async putIfAbsent(_key, value) {
      writeStarted = true;
      await gate;
      return { inserted: true, value };
    },
  };
  const adapter = enabledAdapter(repository);
  const pending = adapter.enqueueFinalizedSale(finalizedSale, { idempotencyKey: 'sale-async' });
  assert.equal(writeStarted, true);
  let settled = false;
  pending.finally(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'submission must wait for the durable queue boundary');
  release();
  const result = await pending;
  assert.equal(result.entry.status, 'PENDING');
  assert.equal(result.entry.destination, 'yellow-dog');
  assert.equal(settled, true);
});

test('sales outbox accepts only finalized sales and requires a durable repository', async () => {
  assert.throws(() => new YellowDogSalesOutbox({ repository: { durability: 'memory', putIfAbsent() {} } }), { code: 'DURABLE_OUTBOX_REQUIRED' });
  const adapter = enabledAdapter();
  await assert.rejects(adapter.enqueueFinalizedSale({ ...finalizedSale, lifecycle: 'open' }, { idempotencyKey: 'open-sale' }), { code: 'SALE_NOT_FINALIZED' });
});

test('pure per-user scheduler never schedules more than two requests per second', () => {
  const scheduler = new YellowDogRateLimitScheduler({ userId: 'integration-user' });
  const times = Array.from({ length: 6 }, () => scheduler.schedule(10_000).scheduledAtMs);
  assert.deepEqual(times, [10_000, 10_500, 11_000, 11_500, 12_000, 12_500]);
  for (const start of times) {
    assert.ok(times.filter((time) => time >= start && time < start + 1000).length <= 2);
  }
});

test('rate scheduler honors numeric and HTTP-date Retry-After without network or sleeping', () => {
  const scheduler = new YellowDogRateLimitScheduler({ userId: 'integration-user' });
  assert.equal(scheduler.schedule(1_000).scheduledAtMs, 1_000);
  assert.equal(scheduler.honorRetryAfter('2', 1_100), 3_100);
  assert.equal(scheduler.schedule(1_200).scheduledAtMs, 3_100);
  assert.equal(scheduler.honorRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 3_200), 5_000);
  assert.equal(scheduler.schedule(3_300).scheduledAtMs, 5_000);
});
