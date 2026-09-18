import { createHash } from 'node:crypto';
import { DomainError, assert } from '../errors.js';

const stable = (value) => { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); };
export const requestHash = (value) => createHash('sha256').update(stable(value)).digest('hex');

export class IdempotencyStore {
  constructor() { this.records = new Map(); }
  execute({ scope, key, request }, operation) {
    assert(scope && key, 'VALIDATION_FAILED'); const composite = `${scope}:${key}`; const hash = requestHash(request); const previous = this.records.get(composite);
    if (previous) { if (previous.hash !== hash) throw new DomainError('IDEMPOTENCY_MISMATCH'); return previous.response; }
    const response = operation(); this.records.set(composite, { hash, response }); return response;
  }
}
