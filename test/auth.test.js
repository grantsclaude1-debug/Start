import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encodeScryptVerifier, InMemoryAttemptLimiter, TemporaryPasscodeGate, verifyScryptPasscode } from '../src/auth/passcode-gate.js';
import { loadConfig, requireConfiguredGate } from '../src/config.js';

const freshPasscode = () => randomBytes(24).toString('base64url');
const sessionSecret = () => randomBytes(32).toString('base64url');

test('gate fails closed when verifier or session secret is absent', () => {
  const config = loadConfig({});
  assert.equal(config.gate.configured, false);
  assert.throws(() => requireConfiguredGate(config), { code: 'PRIVATE_GATE_CONFIGURATION_REQUIRED' });
});

test('scrypt verifier is salted and verifies only the source passcode', async () => {
  const passcode = freshPasscode();
  const first = await encodeScryptVerifier(passcode);
  const second = await encodeScryptVerifier(passcode);
  assert.notEqual(first, second);
  assert.equal(first.includes(passcode), false);
  assert.equal(await verifyScryptPasscode(passcode, first), true);
  assert.equal(await verifyScryptPasscode(freshPasscode(), first), false);
});

test('successful gate entry creates opaque expiring PRIVATE_BUILD_ACCESS only', async () => {
  const passcode = freshPasscode(); const verifier = await encodeScryptVerifier(passcode); const events = [];
  const gate = new TemporaryPasscodeGate({ verifier, sessionSecret: sessionSecret(), audit: (event) => events.push(event) });
  const session = await gate.authenticate({ passcode, sourceBucket: 'coarse-test-source', requestId: 'request-1' });
  assert.equal(session.capability, 'PRIVATE_BUILD_ACCESS');
  assert.equal(session.token.length >= 40, true);
  assert.equal(gate.inspect(session.token).authenticated, true);
  assert.equal(JSON.stringify(events).includes(passcode), false);
  gate.revoke(session.token);
  assert.equal(gate.inspect(session.token).authenticated, false);
});

test('sixth failed source attempt is blocked without verifier success', async () => {
  let now = 1_000; const passcode = freshPasscode(); const verifier = await encodeScryptVerifier(passcode);
  const limiter = new InMemoryAttemptLimiter({ sourceLimit: 5, aggregateLimit: 50, now: () => now });
  const gate = new TemporaryPasscodeGate({ verifier, sessionSecret: sessionSecret(), limiter, now: () => now });
  for (let index = 0; index < 5; index += 1) await assert.rejects(gate.authenticate({ passcode: freshPasscode(), sourceBucket: 'one-source' }), { code: 'PRIVATE_GATE_AUTHENTICATION_FAILED' });
  await assert.rejects(gate.authenticate({ passcode, sourceBucket: 'one-source' }), { code: 'PRIVATE_GATE_RATE_LIMITED' });
  now += 15 * 60_000 + 1;
  const session = await gate.authenticate({ passcode, sourceBucket: 'one-source' });
  assert.equal(gate.inspect(session.token).authenticated, true);
});

test('limiter outage fails closed', async () => {
  const passcode = freshPasscode(); const verifier = await encodeScryptVerifier(passcode); const limiter = new InMemoryAttemptLimiter(); limiter.available = false;
  const gate = new TemporaryPasscodeGate({ verifier, sessionSecret: sessionSecret(), limiter });
  await assert.rejects(gate.authenticate({ passcode }), { code: 'PRIVATE_GATE_RATE_LIMITED' });
});
