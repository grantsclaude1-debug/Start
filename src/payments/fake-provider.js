import { PaymentProvider } from './provider.js';
import { DomainError } from '../errors.js';

const SCENARIOS = Object.freeze({
  stored: { status: 'STORED_FOR_AUTHORIZATION', paid: false, language: 'Stored for authorization — not paid' },
  authorized: { status: 'AUTHORIZED', paid: false, language: 'Authorized — not paid' },
  paid: { status: 'PAID', paid: true, language: 'Paid' },
  declined: { status: 'DECLINED', paid: false, language: 'Denied — no payment collected' },
});
export class FakePaymentProvider extends PaymentProvider {
  constructor({ now = () => new Date().toISOString() } = {}) { super(); this.now = now; this.attempts = new Map(); this.providerCalls = 0; }
  async createOrReusePaymentAttempt({ idempotencyKey, orderId, amountMinor, currency = 'USD', scenario = 'stored' }) {
    if (!idempotencyKey || !orderId || !Number.isSafeInteger(amountMinor) || amountMinor < 0 || !SCENARIOS[scenario]) throw new DomainError('VALIDATION_FAILED');
    const fingerprint = JSON.stringify({ orderId, amountMinor, currency, scenario }); const prior = this.attempts.get(idempotencyKey);
    if (prior) { if (prior.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_MISMATCH'); return prior.result; }
    const result = Object.freeze({ id: `fake-payment-${this.attempts.size + 1}`, orderId, amountMinor, currency, ...SCENARIOS[scenario], fixture: true, rawCardHandling: false, providerCalls: 0, createdAt: this.now() }); this.attempts.set(idempotencyKey, { fingerprint, result }); return result;
  }
  async retrievePayment(id) { const found = [...this.attempts.values()].find((item) => item.result.id === id)?.result; if (!found) throw new DomainError('NOT_FOUND'); return found; }
  async createRefund({ paymentId, amountMinor }) { const payment = await this.retrievePayment(paymentId); if (!payment.paid || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > payment.amountMinor) throw new DomainError('REFUND_NOT_ALLOWED'); return Object.freeze({ id: `fake-refund-${paymentId}`, paymentId, amountMinor, status: 'REFUNDED_FIXTURE', providerCalls: 0 }); }
  async verifyWebhook() { throw new DomainError('LIVE_WEBHOOK_UNREACHABLE'); }
}
