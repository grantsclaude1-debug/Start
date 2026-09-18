import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { encodeScryptVerifier } from '../src/auth/passcode-gate.js';
import { createDemoServer } from '../src/server.js';

const passcode = randomBytes(24).toString('base64url');
let server, base, cookie, csrf;

function request(path, { method = 'GET', body, headers = {} } = {}) {
  const url = new URL(path, base);
  const payload = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method, headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks); const type = String(res.headers['content-type'] ?? '');
        let data = bytes.toString('utf8');
        if (type.includes('application/json')) data = JSON.parse(data);
        resolve({ status: res.statusCode, headers: res.headers, data, bytes });
      });
    });
    req.on('error', reject);
    if (payload) req.end(payload); else req.end();
  });
}

before(async () => {
  const verifier = await encodeScryptVerifier(passcode);
  server = createDemoServer({ env: { PRIVATE_GATE_VERIFIER: verifier, PRIVATE_GATE_SESSION_SECRET: randomBytes(32).toString('base64url') } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server?.listening) await new Promise((resolve) => server.close(resolve)); });

test('server fails closed without valid private gate environment', () => {
  assert.throws(() => createDemoServer({ env: {} }), { code: 'PRIVATE_GATE_CONFIGURATION_REQUIRED' });
});

test('static allowlist serves accessible UI with security headers and leaks no files', async () => {
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.data, /NON-PRODUCTION/);
  assert.match(page.data, /SYNTHETIC DATA ONLY/);
  assert.match(page.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  const script = await request('/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /text\/javascript/);
  const health = await request('/api/health');
  assert.deepEqual(health.data, { status: 'synthetic-preview', production: false, synthetic: true, persistence: 'per-instance-ephemeral' });
  const blocked = await request('/package.json');
  assert.equal(blocked.status, 401);
  assert.deepEqual(blocked.data, { error: 'Authentication required' });
});

test('auth is origin-protected, generic, cookie-backed, and exposes CSRF only after success', async () => {
  const crossOrigin = await request('/api/auth/login', { method: 'POST', body: { passcode }, headers: { origin: 'http://attacker.invalid' } });
  assert.equal(crossOrigin.status, 400);
  assert.deepEqual(crossOrigin.data, { error: 'Request failed' });
  const login = await request('/api/auth/login', { method: 'POST', body: { passcode }, headers: { origin: base } });
  assert.equal(login.status, 200);
  assert.equal(login.data.authenticated, true);
  assert.ok(login.data.csrf.length > 32);
  const setCookie = login.headers['set-cookie'][0];
  assert.match(setCookie, /^synthetic_demo_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(setCookie, new RegExp(passcode));
  cookie = setCookie.split(';')[0]; csrf = login.data.csrf;
  const stateResponse = await request('/api/state', { headers: { cookie } });
  assert.equal(stateResponse.status, 200);
  assert.equal(stateResponse.data.synthetic, true);
  assert.equal(JSON.stringify(stateResponse.data).includes(passcode), false);
  assert.equal(stateResponse.data.integrations.payment.collection, false);
});

test('API enforces JSON type, body limit, same-origin CSRF, atomic holds, orders, and check-ins', async () => {
  const common = { cookie, origin: base, 'x-demo-csrf': csrf };
  const noCsrf = await request('/api/holds', { method: 'POST', body: { quantity: 1 }, headers: { cookie, origin: base, 'idempotency-key': 'no-csrf' } });
  assert.equal(noCsrf.status, 400);
  const wrongType = await request('/api/holds', { method: 'POST', body: '{}', headers: { ...common, 'content-type': 'text/plain', 'idempotency-key': 'wrong-type' } });
  assert.equal(wrongType.status, 415);
  const tooLarge = await request('/api/holds', { method: 'POST', body: JSON.stringify({ padding: 'x'.repeat(17_000) }), headers: { ...common, 'idempotency-key': 'large' } });
  assert.equal(tooLarge.status, 413);

  const first = await request('/api/holds', { method: 'POST', body: { quantity: 10 }, headers: { ...common, 'idempotency-key': 'hold-1' } });
  const second = await request('/api/holds', { method: 'POST', body: { quantity: 10 }, headers: { ...common, 'idempotency-key': 'hold-2' } });
  const oversell = await request('/api/holds', { method: 'POST', body: { quantity: 3 }, headers: { ...common, 'idempotency-key': 'hold-3' } });
  assert.equal(first.status, 201); assert.equal(second.status, 201); assert.equal(oversell.status, 409);
  assert.equal(second.data.state.capacity.available, 2);

  const order = await request('/api/orders', { method: 'POST', body: { holdId: first.data.hold.id, productId: 'timed-demo' }, headers: { ...common, 'idempotency-key': 'order-1' } });
  assert.equal(order.status, 201);
  assert.equal(order.data.order.status, 'CONFIRMED');
  assert.equal(order.data.payment.status, 'DISABLED_PLACEHOLDER');
  assert.equal(order.data.ticket.scannerCompatible, false);
  assert.equal('token' in order.data.ticket, false);
  assert.equal(order.data.state.capacity.confirmed, 10);

  const missingKey = await request('/api/checkins', { method: 'POST', body: { ticketId: order.data.ticket.id }, headers: common });
  assert.equal(missingKey.status, 400);
  const accepted = await request('/api/checkins', { method: 'POST', body: { ticketId: order.data.ticket.id }, headers: { ...common, 'idempotency-key': 'scan-1' } });
  const replay = await request('/api/checkins', { method: 'POST', body: { ticketId: order.data.ticket.id }, headers: { ...common, 'idempotency-key': 'scan-1' } });
  assert.equal(accepted.status, 201); assert.equal(accepted.data.result.result, 'ACCEPTED');
  assert.equal(replay.status, 201); assert.deepEqual(replay.data.result, accepted.data.result);
});

test('authenticated report downloads are deterministic CSV/JSON and unknown static paths stay closed', async () => {
  const csv = await request('/api/reports/capacity_attendance.csv', { headers: { cookie } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /capacity_attendance\.csv/);
  assert.match(csv.data, /^session_id,starts_at,capacity_total/);
  const json = await request('/api/reports/ticket_sales.json', { headers: { cookie } });
  assert.equal(json.status, 200);
  assert.equal(json.data.reportId, 'ticket_sales');
  const leak = await request('/src/server.js', { headers: { cookie } });
  assert.equal(leak.status, 404);
  assert.deepEqual(leak.data, { error: 'Request failed' });
});

test('logout revokes the in-memory session', async () => {
  const logout = await request('/api/auth/logout', { method: 'POST', body: {}, headers: { cookie, origin: base, 'x-demo-csrf': csrf } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
  const rejected = await request('/api/state', { headers: { cookie } });
  assert.equal(rejected.status, 401);
});
