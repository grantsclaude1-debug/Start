import { createHash } from 'node:crypto';
import { DomainError } from '../errors.js';
import { createProduct, createSession } from './catalog.js';

const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = (value) => structuredClone(value);

export class VersionedVenueStore {
  constructor({ products = [], sessions = [], capacityBlocks = [], events } = {}) {
    this.products = new Map(products.map((item) => [item.id, clone(item)]));
    this.sessions = new Map(sessions.map((item) => [item.id, clone(item)]));
    this.capacityBlocks = new Map(capacityBlocks.map((item) => [item.id, clone(item)]));
    this.keys = new Map(); this.events = events;
  }
  list(kind) { return [...this.#map(kind).values()].map(clone); }
  mutate(kind, input, idempotencyKey, capacityPool) {
    if (!idempotencyKey) throw new DomainError('VALIDATION_FAILED');
    const key = `${kind}:${idempotencyKey}`; const hash = fingerprint(input); const prior = this.keys.get(key);
    if (prior) { if (prior.hash !== hash) throw new DomainError('IDEMPOTENCY_MISMATCH'); return clone(prior.result); }
    const map = this.#map(kind); const current = input.id ? map.get(input.id) : null;
    if (current && input.expectedVersion !== current.version) throw new DomainError('VERSION_CONFLICT');
    if (!current && input.expectedVersion != null && input.expectedVersion !== 0) throw new DomainError('VERSION_CONFLICT');
    let value;
    if (kind === 'products') { const validated = createProduct({ id: input.id, tenantId: current?.tenantId ?? 'tenant-demo', venueId: current?.venueId ?? 'venue-demo', name: input.name ?? current?.name, type: input.type ?? current?.type, priceMinor: input.priceMinor ?? current?.priceMinor, currency: current?.currency ?? 'USD', status: input.status ?? current?.status }); value = { ...validated, version: current ? current.version + 1 : 1 }; }
    else if (kind === 'sessions') { const validated = createSession({ id: input.id, productId: input.productId ?? current?.productId, tenantId: current?.tenantId ?? 'tenant-demo', venueId: current?.venueId ?? 'venue-demo', capacityPoolId: current?.capacityPoolId ?? 'pool-demo', startsAt: input.startsAt ?? current?.startsAt, endsAt: input.endsAt ?? current?.endsAt, status: input.status ?? current?.status }); value = { ...validated, label: input.label ?? current?.label, version: current ? current.version + 1 : 1 }; }
    else {
      const quantity = input.quantity ?? current?.quantity;
      if (!input.id || !Number.isSafeInteger(quantity) || quantity < 0 || !String(input.reason ?? current?.reason ?? '').trim()) throw new DomainError('VALIDATION_FAILED');
      const otherBlocks = [...map.values()].filter((block) => block.id !== input.id && block.status === 'ACTIVE').reduce((sum, block) => sum + block.quantity, 0);
      if (input.status !== 'INACTIVE' && capacityPool && otherBlocks + quantity + capacityPool.activeHolds + capacityPool.confirmed > capacityPool.capacityTotal) throw new DomainError('CAPACITY_UNAVAILABLE');
      value = { id: input.id, poolId: 'pool-demo', quantity, reason: input.reason ?? current?.reason, status: input.status ?? current?.status ?? 'ACTIVE', startsAt: input.startsAt ?? current?.startsAt ?? '2030-06-01T00:00:00.000Z', endsAt: input.endsAt ?? current?.endsAt ?? '2030-06-02T00:00:00.000Z', version: current ? current.version + 1 : 1 };
      if (capacityPool) { capacityPool.activeBlocks = otherBlocks + (value.status === 'ACTIVE' ? value.quantity : 0); capacityPool.version += 1; capacityPool.assertInvariant(); }
    }
    map.set(value.id, clone(value)); const action = current ? 'UPDATED' : 'CREATED';
    this.events?.append({ type: `${kind.slice(0, -1).toUpperCase()}_${action}`, aggregateType: kind, aggregateId: value.id, payload: { version: value.version, synthetic: true } });
    this.keys.set(key, { hash, result: clone(value) }); return clone(value);
  }
  #map(kind) { const map = this[kind]; if (!(map instanceof Map)) throw new DomainError('NOT_FOUND'); return map; }
}

export class FinanceService {
  constructor({ events, now = () => new Date().toISOString() } = {}) { this.events = events; this.now = now; this.refunds = []; this.keys = new Map(); }
  refund({ order, amountMinor, expectedVersion, idempotencyKey, scenario = 'refunded', injectFailure = false }) {
    if (!order || !idempotencyKey || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > order.totalMinor) throw new DomainError('REFUND_NOT_ALLOWED');
    const request = { orderId: order.id, amountMinor, expectedVersion, scenario }; const hash = fingerprint(request); const prior = this.keys.get(idempotencyKey);
    if (prior) { if (prior.hash !== hash) throw new DomainError('IDEMPOTENCY_MISMATCH'); return clone(prior.result); }
    if (order.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT');
    if (!['refunded', 'failed'].includes(scenario)) throw new DomainError('VALIDATION_FAILED');
    if (injectFailure || scenario === 'failed') throw new DomainError('REFUND_ATOMIC_FAILURE');
    const already = this.refunds.filter((item) => item.orderId === order.id).reduce((sum, item) => sum + item.amountMinor, 0);
    if (already + amountMinor > order.totalMinor) throw new DomainError('REFUND_NOT_ALLOWED');
    const result = Object.freeze({ id: `refund-${String(this.refunds.length + 1).padStart(4, '0')}`, orderId: order.id, amountMinor, currency: order.currency, status: 'REFUNDED_FIXTURE', paymentLanguage: 'Refunded from paid synthetic fixture', storedLanguage: 'Stored for authorization — not paid orders cannot be refunded', providerCalls: 0, createdAt: this.now(), immutable: true });
    this.refunds.push(result); this.keys.set(idempotencyKey, { hash, result });
    this.events?.append({ type: 'REFUND_RECORDED', aggregateType: 'Refund', aggregateId: result.id, payload: { orderId: order.id, amountMinor, providerCalls: 0 } }); return clone(result);
  }
  list() { return this.refunds.map(clone); }
}
