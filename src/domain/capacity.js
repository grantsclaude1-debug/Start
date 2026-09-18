import { DomainError, assert } from '../errors.js';
import { createHash } from 'node:crypto';

const TERMINAL = new Set(['CONSUMED', 'RELEASED', 'EXPIRED', 'CANCELED']);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class CapacityPool {
  constructor({ id, tenantId, venueId, sessionId, capacityTotal, activeBlocks = 0 }) {
    assert(id && tenantId && venueId && sessionId, 'VALIDATION_FAILED');
    assert(Number.isSafeInteger(capacityTotal) && capacityTotal >= 0 && Number.isSafeInteger(activeBlocks) && activeBlocks >= 0 && activeBlocks <= capacityTotal, 'VALIDATION_FAILED');
    Object.assign(this, { id, tenantId, venueId, sessionId, capacityTotal, activeBlocks, confirmed: 0, activeHolds: 0, version: 1 });
  }
  get available() { return this.capacityTotal - this.confirmed - this.activeHolds - this.activeBlocks; }
  assertInvariant() { assert(this.available >= 0, 'CAPACITY_INVARIANT_BREACH'); }
}

export class HoldStore {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.pools = new Map(); this.holds = new Map(); this.commands = new Map(); }
  addPool(pool) { assert(pool instanceof CapacityPool && !this.pools.has(pool.id), 'VALIDATION_FAILED'); this.pools.set(pool.id, pool); return pool; }
  #once(key, payload, operation) {
    assert(typeof key === 'string' && key.length > 0, 'VALIDATION_FAILED', 'Idempotency key required');
    const requestHash = hash(payload); const previous = this.commands.get(key);
    if (previous) { if (previous.requestHash !== requestHash) throw new DomainError('IDEMPOTENCY_MISMATCH'); return previous.result; }
    const result = operation(); this.commands.set(key, { requestHash, result }); return result;
  }
  createHold({ id, poolId, quantity, expiresAt, idempotencyKey }) {
    return this.#once(idempotencyKey, { id, poolId, quantity, expiresAt }, () => {
      const pool = this.pools.get(poolId); assert(pool, 'NOT_FOUND'); assert(!this.holds.has(id), 'VERSION_CONFLICT');
      assert(Number.isSafeInteger(quantity) && quantity > 0, 'VALIDATION_FAILED');
      const expiry = new Date(expiresAt).valueOf(); assert(Number.isFinite(expiry) && expiry > this.now(), 'VALIDATION_FAILED');
      if (pool.available < quantity) throw new DomainError('CAPACITY_UNAVAILABLE');
      pool.activeHolds += quantity; pool.version += 1; pool.assertInvariant();
      const hold = { id, poolId, tenantId: pool.tenantId, venueId: pool.venueId, sessionId: pool.sessionId, quantity, status: 'ACTIVE', expiresAt: new Date(expiry).toISOString(), orderId: null, version: 1 };
      this.holds.set(id, hold); return Object.freeze({ ...hold });
    });
  }
  transition({ holdId, action, expectedVersion, idempotencyKey, orderId = null }) {
    return this.#once(idempotencyKey, { holdId, action, expectedVersion, orderId }, () => {
      const hold = this.holds.get(holdId); assert(hold, 'NOT_FOUND'); const pool = this.pools.get(hold.poolId); assert(pool, 'NOT_FOUND');
      if (hold.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT');
      if (TERMINAL.has(hold.status)) return Object.freeze({ ...hold });
      assert(hold.status === 'ACTIVE', 'INVALID_TRANSITION');
      const expired = this.now() >= new Date(hold.expiresAt).valueOf();
      if (action === 'CONSUME') {
        if (expired) throw new DomainError('HOLD_EXPIRED'); assert(orderId, 'VALIDATION_FAILED');
        pool.activeHolds -= hold.quantity; pool.confirmed += hold.quantity; hold.status = 'CONSUMED'; hold.orderId = orderId;
      } else if (action === 'RELEASE') { pool.activeHolds -= hold.quantity; hold.status = 'RELEASED'; }
      else if (action === 'EXPIRE') { assert(expired, 'INVALID_TRANSITION'); pool.activeHolds -= hold.quantity; hold.status = 'EXPIRED'; }
      else if (action === 'CANCEL') { pool.activeHolds -= hold.quantity; hold.status = 'CANCELED'; }
      else throw new DomainError('INVALID_TRANSITION');
      hold.version += 1; pool.version += 1; pool.assertInvariant(); return Object.freeze({ ...hold });
    });
  }
}
