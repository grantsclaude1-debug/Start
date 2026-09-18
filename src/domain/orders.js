import { DomainError, assert } from '../errors.js';

export const ORDER_STATES = Object.freeze(['DRAFT', 'PENDING_PAYMENT', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELED', 'REFUNDED', 'EXPIRED']);
const allowed = { DRAFT: ['PENDING_PAYMENT', 'CANCELED', 'EXPIRED'], PENDING_PAYMENT: ['CONFIRMED', 'CANCELED', 'EXPIRED'], CONFIRMED: ['PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELED', 'REFUNDED'], PARTIALLY_FULFILLED: ['FULFILLED', 'CANCELED', 'REFUNDED'], FULFILLED: ['REFUNDED'], CANCELED: ['REFUNDED'], REFUNDED: [], EXPIRED: [] };

export function createOrder({ id, tenantId, venueId, currency, lines, channel = 'ONLINE' }) {
  assert(id && tenantId && venueId && /^[A-Z]{3}$/.test(currency), 'VALIDATION_FAILED');
  assert(Array.isArray(lines) && lines.length > 0, 'VALIDATION_FAILED');
  const snapshots = lines.map((line) => { assert(line.productId && Number.isSafeInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.unitAmountMinor) && line.unitAmountMinor >= 0, 'VALIDATION_FAILED'); return Object.freeze({ ...line }); });
  const totalMinor = snapshots.reduce((sum, line) => sum + line.quantity * line.unitAmountMinor, 0);
  assert(Number.isSafeInteger(totalMinor), 'VALIDATION_FAILED');
  return { id, tenantId, venueId, currency, lines: Object.freeze(snapshots), channel, totalMinor, status: 'DRAFT', version: 1 };
}

export function transitionOrder(order, target, expectedVersion) {
  if (order.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT');
  assert(ORDER_STATES.includes(target) && allowed[order.status].includes(target), 'INVALID_TRANSITION');
  order.status = target; order.version += 1; return Object.freeze({ ...order });
}
