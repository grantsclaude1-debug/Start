import test from 'node:test';
import assert from 'node:assert/strict';
import { AdmissionRegistry, generateTicketSigningKeyPair, TicketTokenService } from '../src/domain/tickets.js';

function service(now = Date.parse('2030-06-01T14:30:00Z')) {
  const { privateKey, publicKey } = generateTicketSigningKeyPair();
  return new TicketTokenService({ privateKey, publicKeys: new Map([['key-1', publicKey]]), keyId: 'key-1', now: () => now });
}

const claims = { ticketId: 'ticket-1', venueId: 'venue-1', sessionId: 'session-1', validFrom: '2030-06-01T14:00:00Z', validUntil: '2030-06-01T15:00:00Z', maxEntries: 1 };

test('Ed25519 ticket token verifies without PII', () => {
  const tokens = service(); const { token } = tokens.issue(claims); const payload = tokens.verify(token, { venueId: 'venue-1' });
  assert.equal(payload.ticket_id, 'ticket-1');
  assert.equal(token.includes('email'), false); assert.equal(token.includes('name'), false);
});

test('ticket token tampering and wrong venue fail', () => {
  const tokens = service(); const { token } = tokens.issue(claims);
  const parts = token.split('.'); const tampered = `${parts[0]}.${parts[1].slice(0, -1)}A.${parts[2]}`;
  assert.throws(() => tokens.verify(tampered, { venueId: 'venue-1' }), { code: 'TICKET_TOKEN_INVALID' });
  assert.throws(() => tokens.verify(token, { venueId: 'venue-2' }), { code: 'WRONG_VENUE' });
});

test('ticket validity window is enforced', () => {
  const early = service(Date.parse('2030-06-01T13:59:59Z')); const { token } = early.issue(claims);
  assert.throws(() => early.verify(token, { venueId: 'venue-1' }), { code: 'TOO_EARLY' });
  const late = service(Date.parse('2030-06-01T15:00:00Z')); const lateToken = late.issue(claims).token;
  assert.throws(() => late.verify(lateToken, { venueId: 'venue-1' }), { code: 'TOO_LATE' });
});

test('final-use admission accepts once and preserves duplicate attempts', () => {
  const tokens = service(); const issued = tokens.issue(claims); const registry = new AdmissionRegistry(); registry.add(issued.ticket);
  assert.equal(registry.checkIn({ ticketId: 'ticket-1', idempotencyKey: 'scan-1' }).result, 'ACCEPTED');
  assert.equal(registry.checkIn({ ticketId: 'ticket-1', idempotencyKey: 'scan-2' }).result, 'DUPLICATE');
  assert.equal(registry.attempts.length, 2);
  assert.deepEqual(registry.checkIn({ ticketId: 'ticket-1', idempotencyKey: 'scan-2' }), registry.attempts[1]);
});
