import test from 'node:test';
import assert from 'node:assert/strict';
import { CapacityPool, HoldStore } from '../src/domain/capacity.js';

function setup(now = 1_000) {
  const store = new HoldStore({ now: () => now });
  const pool = store.addPool(new CapacityPool({ id: 'pool-1', tenantId: 'tenant-1', venueId: 'venue-1', sessionId: 'session-1', capacityTotal: 2 }));
  return { store, pool };
}

test('holds reserve capacity atomically and reject oversell', () => {
  const { store, pool } = setup();
  store.createHold({ id: 'hold-1', poolId: pool.id, quantity: 2, expiresAt: 5_000, idempotencyKey: 'create-1' });
  assert.equal(pool.available, 0);
  assert.throws(() => store.createHold({ id: 'hold-2', poolId: pool.id, quantity: 1, expiresAt: 5_000, idempotencyKey: 'create-2' }), { code: 'CAPACITY_UNAVAILABLE' });
  assert.equal(pool.confirmed + pool.activeHolds + pool.activeBlocks <= pool.capacityTotal, true);
});

test('same hold command is idempotent and mismatched reuse is rejected', () => {
  const { store, pool } = setup();
  const command = { id: 'hold-1', poolId: pool.id, quantity: 1, expiresAt: 5_000, idempotencyKey: 'create-1' };
  assert.deepEqual(store.createHold(command), store.createHold(command));
  assert.equal(pool.activeHolds, 1);
  assert.throws(() => store.createHold({ ...command, quantity: 2 }), { code: 'IDEMPOTENCY_MISMATCH' });
});

test('consume converts held to confirmed exactly once and terminals never reactivate', () => {
  const { store, pool } = setup();
  store.createHold({ id: 'hold-1', poolId: pool.id, quantity: 1, expiresAt: 5_000, idempotencyKey: 'create-1' });
  const consumed = store.transition({ holdId: 'hold-1', action: 'CONSUME', expectedVersion: 1, idempotencyKey: 'consume-1', orderId: 'order-1' });
  assert.equal(consumed.status, 'CONSUMED'); assert.equal(pool.activeHolds, 0); assert.equal(pool.confirmed, 1);
  const repeated = store.transition({ holdId: 'hold-1', action: 'CONSUME', expectedVersion: 1, idempotencyKey: 'consume-1', orderId: 'order-1' });
  assert.equal(repeated.status, 'CONSUMED'); assert.equal(pool.confirmed, 1);
  const terminalRepeat = store.transition({ holdId: 'hold-1', action: 'RELEASE', expectedVersion: 2, idempotencyKey: 'release-1' });
  assert.equal(terminalRepeat.status, 'CONSUMED'); assert.equal(pool.confirmed, 1); assert.equal(pool.activeHolds, 0);
});

test('expiry requires trusted time and releases held capacity', () => {
  let now = 1_000; const store = new HoldStore({ now: () => now }); const pool = store.addPool(new CapacityPool({ id: 'pool', tenantId: 't', venueId: 'v', sessionId: 's', capacityTotal: 1 }));
  store.createHold({ id: 'hold', poolId: 'pool', quantity: 1, expiresAt: 2_000, idempotencyKey: 'create' });
  assert.throws(() => store.transition({ holdId: 'hold', action: 'EXPIRE', expectedVersion: 1, idempotencyKey: 'too-soon' }), { code: 'INVALID_TRANSITION' });
  now = 2_000;
  assert.equal(store.transition({ holdId: 'hold', action: 'EXPIRE', expectedVersion: 1, idempotencyKey: 'expire' }).status, 'EXPIRED');
  assert.equal(pool.available, 1);
});

test('stale expected version is rejected', () => {
  const { store, pool } = setup();
  store.createHold({ id: 'hold', poolId: pool.id, quantity: 1, expiresAt: 5_000, idempotencyKey: 'create' });
  assert.throws(() => store.transition({ holdId: 'hold', action: 'RELEASE', expectedVersion: 99, idempotencyKey: 'release' }), { code: 'VERSION_CONFLICT' });
});
