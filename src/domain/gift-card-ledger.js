import { createHash } from 'node:crypto';
import { DomainError } from '../errors.js';

const TYPES = new Set(['ISSUED', 'REDEEMED', 'ADJUSTED', 'EXPIRED']);
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());

export class GiftCardLedger {
  #entries = [];
  #keys = new Map();

  append({ cardId, type, amountMinor, idempotencyKey, reason = '', occurredAt = new Date().toISOString() }) {
    if (!cardId || !TYPES.has(type) || !Number.isSafeInteger(amountMinor) || !idempotencyKey) throw new DomainError('VALIDATION_FAILED');
    if (type === 'ISSUED' && amountMinor <= 0) throw new DomainError('VALIDATION_FAILED');
    if (['REDEEMED', 'EXPIRED'].includes(type) && amountMinor >= 0) throw new DomainError('VALIDATION_FAILED');
    const command = stable({ cardId, type, amountMinor, reason });
    const existing = this.#keys.get(idempotencyKey);
    if (existing) {
      if (existing.command !== command) throw new DomainError('IDEMPOTENCY_MISMATCH');
      return existing.entry;
    }
    const current = this.balance(cardId);
    if (current + amountMinor < 0) throw new DomainError('INSUFFICIENT_GIFT_CARD_BALANCE');
    const sequence = this.#entries.length + 1;
    const previousHash = this.#entries.at(-1)?.hash ?? 'GENESIS';
    const body = { sequence, cardId, type, amountMinor, reason: String(reason), occurredAt, previousHash };
    const entry = Object.freeze({ ...body, hash: createHash('sha256').update(stable(body)).digest('hex') });
    this.#entries.push(entry);
    this.#keys.set(idempotencyKey, { command, entry });
    return entry;
  }

  balance(cardId) { return this.#entries.filter((entry) => entry.cardId === cardId).reduce((sum, entry) => sum + entry.amountMinor, 0); }
  entries(cardId) { return Object.freeze(this.#entries.filter((entry) => !cardId || entry.cardId === cardId).map((entry) => ({ ...entry }))); }
  cards() {
    return [...new Set(this.#entries.map((entry) => entry.cardId))].map((cardId) => ({ id: cardId, balanceMinor: this.balance(cardId), entryCount: this.#entries.filter((entry) => entry.cardId === cardId).length }));
  }
  verify() {
    let previousHash = 'GENESIS';
    return this.#entries.every((entry, index) => {
      const { hash, ...body } = entry;
      const valid = entry.sequence === index + 1 && entry.previousHash === previousHash && createHash('sha256').update(stable(body)).digest('hex') === hash;
      previousHash = hash;
      return valid;
    });
  }
}
