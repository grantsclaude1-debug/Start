import { createHash } from 'node:crypto';
import { DomainError } from '../errors.js';

const stableValue = (value) => Array.isArray(value) ? value.map(stableValue) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])) : value;
export class DomainEventLog {
  constructor({ now = () => new Date().toISOString() } = {}) { this.now = now; this.events = []; this.previousHash = 'GENESIS'; }
  append({ type, aggregateType, aggregateId, payload = {}, correlationId = null }) { if (!type || !aggregateType || !aggregateId) throw new DomainError('VALIDATION_FAILED'); const body = { sequence: this.events.length + 1, type, aggregateType, aggregateId, payload: stableValue(payload), correlationId, occurredAt: this.now(), previousHash: this.previousHash }; const event = Object.freeze({ ...body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex') }); this.events.push(event); this.previousHash = event.hash; return event; }
  list() { return this.events.map((event) => structuredClone(event)); }
  verify() { let previous = 'GENESIS'; return this.events.every((event, index) => { const { hash, ...body } = event; const valid = event.sequence === index + 1 && event.previousHash === previous && createHash('sha256').update(JSON.stringify(body)).digest('hex') === hash; previous = hash; return valid; }); }
}
export class ExceptionCaseStore {
  constructor({ now = () => new Date().toISOString(), events = null } = {}) { this.now = now; this.events = events; this.cases = []; }
  open({ type, sourceType, sourceId, severity = 'ATTENTION', summary }) { const item = Object.freeze({ id: `exception-${String(this.cases.length + 1).padStart(4, '0')}`, type, sourceType, sourceId, severity, summary, status: 'OPEN', createdAt: this.now(), timeline: Object.freeze([{ status: 'OPEN', at: this.now(), note: summary }]) }); this.cases.push(item); this.events?.append({ type: 'EXCEPTION_OPENED', aggregateType: 'ExceptionCase', aggregateId: item.id, payload: { type, sourceType, sourceId, severity } }); return item; }
  list() { return this.cases.map((item) => structuredClone(item)); }
}

// Synchronous in-memory transaction used only to prove all-or-nothing prototype mutations.
export function atomicMutation({ snapshot, restore, steps, injectFailureAt = null }) {
  const before = snapshot(); const results = [];
  try { for (let index = 0; index < steps.length; index += 1) { if (injectFailureAt === index) throw new DomainError('INJECTED_ATOMIC_FAILURE'); results.push(steps[index]()); } return results; }
  catch (error) { restore(before); throw error; }
}
