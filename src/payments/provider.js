import { DomainError, assert } from '../errors.js';

export class PaymentProvider {
  async createOrReusePaymentAttempt() { throw new DomainError('NOT_IMPLEMENTED'); }
  async retrievePayment() { throw new DomainError('NOT_IMPLEMENTED'); }
  async createRefund() { throw new DomainError('NOT_IMPLEMENTED'); }
  async verifyWebhook() { throw new DomainError('NOT_IMPLEMENTED'); }
}

export function createPayment({ id, orderId, tenantId, venueId, amountMinor, currency }) {
  assert(id && orderId && tenantId && venueId && Number.isSafeInteger(amountMinor) && amountMinor >= 0 && /^[A-Z]{3}$/.test(currency), 'VALIDATION_FAILED');
  return { id, orderId, tenantId, venueId, amountMinor, currency, capturedMinor: 0, refundedMinor: 0, status: 'CREATED', version: 1 };
}
