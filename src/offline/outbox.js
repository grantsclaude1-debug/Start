import { createHash, randomUUID } from 'node:crypto';
import { DomainError, assert } from '../errors.js';

export class Outbox {
  constructor({ originId, originEpoch = 1, now = () => new Date() }) { assert(originId, 'VALIDATION_FAILED'); this.originId = originId; this.originEpoch = originEpoch; this.now = now; this.sequence = 0; this.events = []; this.keys = new Map(); this.previousHash = 'GENESIS'; }
  append({ eventType, aggregateType, aggregateId, aggregateVersion, payload, idempotencyKey }) {
    assert(eventType && aggregateType && aggregateId && idempotencyKey, 'VALIDATION_FAILED');
    const bodyHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex'); const previous = this.keys.get(idempotencyKey);
    if (previous) { if (previous.bodyHash !== bodyHash) throw new DomainError('IDEMPOTENCY_MISMATCH'); return previous.event; }
    const event = { eventId: randomUUID(), eventType, schemaVersion: 1, originId: this.originId, originEpoch: this.originEpoch, originSequence: ++this.sequence, aggregateType, aggregateId, aggregateVersion, occurredAt: this.now().toISOString(), payload, previousEventHash: this.previousHash, status: 'PENDING' };
    event.eventHash = createHash('sha256').update(JSON.stringify(event)).digest('hex'); this.previousHash = event.eventHash; this.events.push(event); this.keys.set(idempotencyKey, { bodyHash, event }); return Object.freeze({ ...event });
  }
  pending(limit = 100) { return this.events.filter((event) => event.status === 'PENDING').slice(0, limit).map((event) => Object.freeze({ ...event })); }
  acknowledge(eventId) { const event = this.events.find((item) => item.eventId === eventId); assert(event, 'NOT_FOUND'); event.status = 'ACKNOWLEDGED'; return Object.freeze({ ...event }); }
}
