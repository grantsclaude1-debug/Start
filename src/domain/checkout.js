import { createOrder, transitionOrder } from './orders.js';
import { DomainError } from '../errors.js';

export class AtomicCheckoutService {
  constructor({ holds, tokens, admissions, outbox, paymentProvider, now = () => Date.now(), id = (() => { let value = 0; return () => `local-${++value}`; })() }) { Object.assign(this, { holds, tokens, admissions, outbox, paymentProvider, now, id }); this.orders = []; this.tickets = []; this.audit = []; }
  async confirm({ holdId, product, idempotencyKey, paymentScenario = 'stored', injectFailureAt = null }) {
    const hold = this.holds.holds.get(holdId); if (!hold || hold.status !== 'ACTIVE' || !product || !idempotencyKey) throw new DomainError('VALIDATION_FAILED');
    const pool = this.holds.pools.get(hold.poolId);
    const before = { pool: { ...pool }, hold: { ...hold }, orders: [...this.orders], tickets: [...this.tickets], admissionsTickets: new Map([...this.admissions.tickets].map(([key, value]) => [key, { ...value }])), admissionsAttempts: [...this.admissions.attempts], admissionsKeys: new Map(this.admissions.keys), outboxEvents: this.outbox.events.map((event) => ({ ...event })), outboxKeys: new Map(this.outbox.keys), outboxSequence: this.outbox.sequence, outboxPreviousHash: this.outbox.previousHash, audit: [...this.audit] };
    const fail = (step) => { if (injectFailureAt === step) throw new DomainError('INJECTED_ATOMIC_FAILURE'); };
    try {
      const order = createOrder({ id: this.id(), tenantId: hold.tenantId, venueId: hold.venueId, currency: product.currency ?? 'USD', channel: 'SYNTHETIC_DEMO', lines: [{ productId: product.id, quantity: hold.quantity, unitAmountMinor: product.priceMinor }] });
      transitionOrder(order, 'PENDING_PAYMENT', 1); fail('payment');
      const payment = await this.paymentProvider.createOrReusePaymentAttempt({ idempotencyKey: `payment:${idempotencyKey}`, orderId: order.id, amountMinor: order.totalMinor, currency: order.currency, scenario: paymentScenario });
      transitionOrder(order, 'CONFIRMED', 2); this.holds.transition({ holdId, action: 'CONSUME', expectedVersion: hold.version, idempotencyKey: `hold:${idempotencyKey}`, orderId: order.id }); fail('hold');
      const ticketId = this.id(); const issued = this.tokens.issue({ ticketId, venueId: hold.venueId, sessionId: hold.sessionId, validFrom: new Date(this.now() - 1000), validUntil: new Date(this.now() + 86_400_000), maxEntries: hold.quantity }); this.admissions.add(issued.ticket); this.tickets.push(Object.freeze({ id: ticketId, orderId: order.id, token: issued.token })); fail('ticket');
      this.outbox.append({ eventType: 'synthetic.order.confirmed.v1', aggregateType: 'Order', aggregateId: order.id, aggregateVersion: order.version, payload: { totalMinor: order.totalMinor }, idempotencyKey: `outbox:${idempotencyKey}` }); fail('outbox');
      this.audit.push(Object.freeze({ type: 'ORDER_CONFIRMED', orderId: order.id, at: new Date(this.now()).toISOString() })); this.orders.push(Object.freeze({ ...order })); fail('audit');
      return Object.freeze({ order: { ...order }, payment, ticket: { id: ticketId, orderId: order.id } });
    } catch (error) {
      Object.assign(pool, before.pool); Object.assign(hold, before.hold); this.orders = before.orders; this.tickets = before.tickets; this.admissions.tickets = before.admissionsTickets; this.admissions.attempts = before.admissionsAttempts; this.admissions.keys = before.admissionsKeys; this.outbox.events = before.outboxEvents; this.outbox.keys = before.outboxKeys; this.outbox.sequence = before.outboxSequence; this.outbox.previousHash = before.outboxPreviousHash; this.audit = before.audit; throw error;
    }
  }
}
