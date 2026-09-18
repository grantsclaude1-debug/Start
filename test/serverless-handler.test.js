import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeScryptVerifier } from '../src/auth/passcode-gate.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const passcode = randomBytes(24).toString('base64url');
let server;
let base;

function request(path, { method = 'GET', body, headers = {} } = {}) {
  const url = new URL(path, base);
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method, headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, data: String(res.headers['content-type']).includes('application/json') ? JSON.parse(text) : text });
      });
    });
    req.on('error', reject);
    if (payload) req.end(payload); else req.end();
  });
}

before(async () => {
  process.env.PRIVATE_GATE_VERIFIER = await encodeScryptVerifier(passcode);
  process.env.PRIVATE_GATE_SESSION_SECRET = randomBytes(32).toString('base64url');
  const { default: handler } = await import(`../api/handler.js?test=${randomBytes(8).toString('hex')}`);
  delete process.env.PRIVATE_GATE_VERIFIER;
  delete process.env.PRIVATE_GATE_SESSION_SECRET;
  server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { if (server?.listening) await new Promise((resolve) => server.close(resolve)); });

test('serverless entry fails closed when either required gate variable is absent', async () => {
  const verifier = await encodeScryptVerifier(randomBytes(24).toString('base64url'));
  for (const env of [
    { PRIVATE_GATE_SESSION_SECRET: randomBytes(32).toString('base64url') },
    { PRIVATE_GATE_VERIFIER: verifier },
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', "import('./api/handler.js')"], {
      cwd: appRoot,
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /PRIVATE_GATE_CONFIGURATION_REQUIRED|Private build unavailable/);
  }
});

test('serverless entry serves bundled static assets with explicit preview labeling', async () => {
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.data, /NON-PRODUCTION/);
  assert.match(page.data, /PER-INSTANCE/);
  assert.match(page.data, /EPHEMERAL/);
  assert.match(page.data, /unsuitable for real sales, capacity, tickets, or check-in/i);
  const script = await request('/app.js');
  assert.equal(script.status, 200);
});

test('serverless proxy mode accepts HTTPS forwarded same-origin login and always sets Secure', async () => {
  const origin = `https://127.0.0.1:${server.address().port}`;
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: { passcode },
    headers: { host: `127.0.0.1:${server.address().port}`, origin, 'x-forwarded-proto': 'https' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.authenticated, true);
  assert.match(response.headers['set-cookie'][0], /; Secure$/);
});

test('serverless health states synthetic per-instance ephemeral persistence', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.data, { status: 'synthetic-preview', production: false, synthetic: true, persistence: 'per-instance-ephemeral' });
});
