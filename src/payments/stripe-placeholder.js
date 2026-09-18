import { PaymentProvider } from './provider.js';
import { DomainError } from '../errors.js';

export class DisabledStripeAdapter extends PaymentProvider {
  constructor({ enabled = false } = {}) { super(); this.enabled = enabled; }
  capabilities() { return Object.freeze({ provider: 'stripe', liveCalls: false, connect: false, terminal: false, webhooks: false }); }
  #blocked() { throw new DomainError('PAYMENT_PROVIDER_DISABLED', 'Stripe adapter is a placeholder; no network or resources are available'); }
  async createOrReusePaymentAttempt() { return this.#blocked(); }
  async retrievePayment() { return this.#blocked(); }
  async createRefund() { return this.#blocked(); }
  async verifyWebhook() { return this.#blocked(); }
}
