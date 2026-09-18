import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DomainError } from '../errors.js';

const scrypt = promisify(scryptCallback);
const DEFAULT_WINDOW_MS = 15 * 60_000;

function encoded(bytes) { return Buffer.from(bytes).toString('base64url'); }
function decoded(text) { return Buffer.from(text, 'base64url'); }

export function encodeScryptVerifier(passcode, { salt = randomBytes(16), N = 16_384, r = 8, p = 1, keylen = 64 } = {}) {
  if (typeof passcode !== 'string' || passcode.length < 16 || passcode.length > 1024) throw new DomainError('INVALID_PASSCODE_SETUP', 'Passcode setup input must be 16–1024 characters');
  return new Promise((resolve, reject) => {
    scryptCallback(passcode, salt, keylen, { N, r, p, maxmem: Math.max(64 * 1024 * 1024, 256 * N * r) }, (error, key) => {
      if (error) reject(error);
      else resolve(`scrypt$v=1$N=${N}$r=${r}$p=${p}$keylen=${keylen}$${encoded(salt)}$${encoded(key)}`);
    });
  });
}

export function parseScryptVerifier(value) {
  const parts = String(value).split('$');
  if (parts.length !== 8 || parts[0] !== 'scrypt' || parts[1] !== 'v=1') throw new DomainError('PRIVATE_GATE_CONFIGURATION_REQUIRED', 'Private build unavailable');
  const params = Object.fromEntries(parts.slice(2, 6).map((part) => part.split('=')));
  const N = Number(params.N), r = Number(params.r), p = Number(params.p), keylen = Number(params.keylen);
  const salt = decoded(parts[6]), expected = decoded(parts[7]);
  if (!Number.isInteger(N) || N < 16_384 || N > 1_048_576 || (N & (N - 1)) !== 0 || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16 || !Number.isInteger(keylen) || keylen < 32 || keylen > 128 || salt.length < 16 || expected.length !== keylen) {
    throw new DomainError('PRIVATE_GATE_CONFIGURATION_REQUIRED', 'Private build unavailable');
  }
  return { N, r, p, keylen, salt, expected };
}

export async function verifyScryptPasscode(passcode, verifier) {
  const parsed = parseScryptVerifier(verifier);
  if (typeof passcode !== 'string' || passcode.length > 1024) return false;
  const actual = await scrypt(passcode, parsed.salt, parsed.keylen, { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: Math.max(64 * 1024 * 1024, 256 * parsed.N * parsed.r) });
  return timingSafeEqual(actual, parsed.expected);
}

export class InMemoryAttemptLimiter {
  constructor({ sourceLimit = 5, aggregateLimit = 50, windowMs = DEFAULT_WINDOW_MS, now = () => Date.now() } = {}) {
    this.sourceLimit = sourceLimit; this.aggregateLimit = aggregateLimit; this.windowMs = windowMs; this.now = now;
    this.sourceFailures = [];
    this.aggregateFailures = [];
    this.available = true;
  }
  #prune(now) {
    this.sourceFailures = this.sourceFailures.filter((entry) => entry.at > now - this.windowMs);
    this.aggregateFailures = this.aggregateFailures.filter((at) => at > now - this.windowMs);
  }
  assertAllowed(sourceHash) {
    if (!this.available) throw new DomainError('PRIVATE_GATE_RATE_LIMITED', 'Authentication failed');
    const now = this.now(); this.#prune(now);
    const sourceCount = this.sourceFailures.filter((entry) => entry.sourceHash === sourceHash).length;
    if (sourceCount >= this.sourceLimit || this.aggregateFailures.length >= this.aggregateLimit) throw new DomainError('PRIVATE_GATE_RATE_LIMITED', 'Authentication failed');
  }
  recordFailure(sourceHash) { const at = this.now(); this.sourceFailures.push({ sourceHash, at }); this.aggregateFailures.push(at); }
  clearSource(sourceHash) { this.sourceFailures = this.sourceFailures.filter((entry) => entry.sourceHash !== sourceHash); }
}

export class TemporaryPasscodeGate {
  constructor({ verifier, sessionSecret, configVersion = 1, limiter = new InMemoryAttemptLimiter(), now = () => Date.now(), audit = () => {} }) {
    this.verifier = verifier; this.sessionSecret = sessionSecret; this.configVersion = configVersion; this.limiter = limiter; this.now = now; this.audit = audit;
    this.sessions = new Map();
    this.configured = typeof sessionSecret === 'string' && sessionSecret.length >= 32;
    try { parseScryptVerifier(verifier); } catch { this.configured = false; }
  }
  #hash(value) { return createHmac('sha256', this.sessionSecret).update(value).digest('base64url'); }
  async authenticate({ passcode, sourceBucket = 'unknown', requestId = 'unknown' }) {
    if (!this.configured) throw new DomainError('PRIVATE_GATE_CONFIGURATION_REQUIRED', 'Private build unavailable');
    const sourceHash = this.#hash(sourceBucket);
    this.limiter.assertAllowed(sourceHash);
    const valid = await verifyScryptPasscode(passcode, this.verifier);
    if (!valid) {
      this.limiter.recordFailure(sourceHash);
      this.audit({ type: 'gate_attempt', result: 'failed', requestId, sourceHash, configVersion: this.configVersion, occurredAt: new Date(this.now()).toISOString() });
      throw new DomainError('PRIVATE_GATE_AUTHENTICATION_FAILED', 'Authentication failed');
    }
    this.limiter.clearSource(sourceHash);
    const token = encoded(randomBytes(32));
    const createdAt = this.now();
    this.sessions.set(this.#hash(token), { createdAt, lastSeenAt: createdAt, idleExpiresAt: createdAt + 30 * 60_000, absoluteExpiresAt: createdAt + 8 * 60 * 60_000, configVersion: this.configVersion, revokedAt: null });
    this.audit({ type: 'gate_session', result: 'created', requestId, sourceHash, configVersion: this.configVersion, occurredAt: new Date(createdAt).toISOString() });
    return { token, capability: 'PRIVATE_BUILD_ACCESS', idleExpiresAt: new Date(createdAt + 30 * 60_000).toISOString(), absoluteExpiresAt: new Date(createdAt + 8 * 60 * 60_000).toISOString() };
  }
  inspect(token) {
    if (!this.configured || typeof token !== 'string') return { authenticated: false };
    const record = this.sessions.get(this.#hash(token));
    const now = this.now();
    if (!record || record.revokedAt || record.configVersion !== this.configVersion || now >= record.idleExpiresAt || now >= record.absoluteExpiresAt) return { authenticated: false };
    record.lastSeenAt = now; record.idleExpiresAt = Math.min(now + 30 * 60_000, record.absoluteExpiresAt);
    return { authenticated: true, capability: 'PRIVATE_BUILD_ACCESS', idleExpiresAt: new Date(record.idleExpiresAt).toISOString(), absoluteExpiresAt: new Date(record.absoluteExpiresAt).toISOString() };
  }
  revoke(token) { if (this.configured && typeof token === 'string') { const record = this.sessions.get(this.#hash(token)); if (record) record.revokedAt = this.now(); } }
  revokeAll() { for (const record of this.sessions.values()) record.revokedAt = this.now(); }
}
