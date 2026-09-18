import test from 'node:test';
import assert from 'node:assert/strict';
import { IdempotencyStore } from '../src/offline/idempotency.js';
import { Outbox } from '../src/offline/outbox.js';

test('idempotency repeats identical commands and rejects key collisions', () => {
  const store = new IdempotencyStore(); let effects = 0;
  const first = store.execute({ scope: 'order', key: 'key-1', request: { amount: 100, currency: 'USD' } }, () => ({ effect: ++effects }));
  const second = store.execute({ scope: 'order', key: 'key-1', request: { currency: 'USD', amount: 100 } }, () => ({ effect: ++effects }));
  assert.deepEqual(first, second); assert.equal(effects, 1);
  assert.throws(() => store.execute({ scope: 'order', key: 'key-1', request: { amount: 101, currency: 'USD' } }, () => ({})), { code: 'IDEMPOTENCY_MISMATCH' });
});

test('outbox is append-only, ordered, hash chained, and acknowledged explicitly', () => {
  const outbox = new Outbox({ originId: 'edge-demo', now: () => new Date('2030-06-01T00:00:00Z') });
  const first = outbox.append({ eventType: 'order.confirmed.v1', aggregateType: 'Order', aggregateId: 'order-1', aggregateVersion: 1, payload: { totalMinor: 100 }, idempotencyKey: 'event-1' });
  const second = outbox.append({ eventType: 'ticket.issued.v1', aggregateType: 'Ticket', aggregateId: 'ticket-1', aggregateVersion: 1, payload: { orderId: 'order-1' }, idempotencyKey: 'event-2' });
  assert.equal(first.originSequence, 1); assert.equal(second.originSequence, 2); assert.equal(second.previousEventHash, first.eventHash); assert.equal(outbox.pending().length, 2);
  outbox.acknowledge(first.eventId); assert.equal(outbox.pending().length, 1);
});

test('outbox key with different payload is a security-relevant mismatch', () => {
  const outbox = new Outbox({ originId: 'edge-demo' });
  const base = { eventType: 'order.confirmed.v1', aggregateType: 'Order', aggregateId: 'order-1', aggregateVersion: 1, idempotencyKey: 'same' };
  outbox.append({ ...base, payload: { totalMinor: 100 } });
  assert.throws(() => outbox.append({ ...base, payload: { totalMinor: 200 } }), { code: 'IDEMPOTENCY_MISMATCH' });
});
