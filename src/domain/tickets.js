import { createHash, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { DomainError, assert } from '../errors.js';

const json64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const parse64 = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

export function generateTicketSigningKeyPair() { return generateKeyPairSync('ed25519'); }

export class TicketTokenService {
  constructor({ privateKey, publicKeys, keyId, now = () => Date.now() }) { this.privateKey = privateKey; this.publicKeys = publicKeys; this.keyId = keyId; this.now = now; }
  issue(claims) {
    assert(this.privateKey && this.keyId && claims.ticketId && claims.venueId && claims.sessionId, 'VALIDATION_FAILED');
    assert(Number.isSafeInteger(claims.maxEntries) && claims.maxEntries > 0, 'VALIDATION_FAILED');
    const payload = { v: 1, ticket_id: claims.ticketId, venue_id: claims.venueId, entitlement_type: claims.entitlementType ?? 'ADMISSION', session_id: claims.sessionId, valid_from: new Date(claims.validFrom).toISOString(), valid_until: new Date(claims.validUntil).toISOString(), max_entries: claims.maxEntries, issue_revision: claims.issueRevision ?? 1, nonce: randomBytes(16).toString('base64url') };
    assert(new Date(payload.valid_from) < new Date(payload.valid_until), 'VALIDATION_FAILED');
    const header = { alg: 'EdDSA', kid: this.keyId, typ: 'DNZ-TICKET+JWS' };
    const signingInput = `${json64(header)}.${json64(payload)}`;
    const token = `${signingInput}.${sign(null, Buffer.from(signingInput), this.privateKey).toString('base64url')}`;
    return { ticket: Object.freeze({ id: claims.ticketId, venueId: claims.venueId, sessionId: claims.sessionId, status: 'VALID', maxEntries: claims.maxEntries, redeemedEntries: 0, tokenHash: createHash('sha256').update(token).digest('hex'), version: 1 }), token };
  }
  verify(token, { venueId, at = this.now() } = {}) {
    const parts = String(token).split('.'); if (parts.length !== 3) throw new DomainError('TICKET_TOKEN_INVALID');
    let header, payload; try { header = parse64(parts[0]); payload = parse64(parts[1]); } catch { throw new DomainError('TICKET_TOKEN_INVALID'); }
    if (header.alg !== 'EdDSA' || header.typ !== 'DNZ-TICKET+JWS' || !this.publicKeys.has(header.kid)) throw new DomainError('TICKET_TOKEN_INVALID');
    if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), this.publicKeys.get(header.kid), Buffer.from(parts[2], 'base64url'))) throw new DomainError('TICKET_TOKEN_INVALID');
    if (payload.venue_id !== venueId) throw new DomainError('WRONG_VENUE');
    const time = Number(at); if (time < new Date(payload.valid_from).valueOf()) throw new DomainError('TOO_EARLY'); if (time >= new Date(payload.valid_until).valueOf()) throw new DomainError('TOO_LATE');
    return Object.freeze(payload);
  }
}

export class AdmissionRegistry {
  constructor() { this.tickets = new Map(); this.attempts = []; this.keys = new Map(); }
  add(ticket) { this.tickets.set(ticket.id, { ...ticket }); }
  checkIn({ ticketId, idempotencyKey }) {
    assert(idempotencyKey, 'VALIDATION_FAILED');
    const previous = this.keys.get(idempotencyKey); if (previous) { if (previous.ticketId !== ticketId) throw new DomainError('IDEMPOTENCY_MISMATCH'); return previous; }
    const ticket = this.tickets.get(ticketId); assert(ticket, 'NOT_FOUND');
    let result = 'ACCEPTED';
    if (ticket.status === 'VOID') result = 'VOID';
    else if (ticket.redeemedEntries >= ticket.maxEntries) result = 'DUPLICATE';
    else { ticket.redeemedEntries += 1; ticket.version += 1; ticket.status = ticket.redeemedEntries === ticket.maxEntries ? 'REDEEMED' : 'PARTIALLY_REDEEMED'; }
    const attempt = Object.freeze({ ticketId, result, sequence: this.attempts.length + 1 }); this.attempts.push(attempt); this.keys.set(idempotencyKey, attempt); return attempt;
  }
}
