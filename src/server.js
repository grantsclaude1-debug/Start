import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TemporaryPasscodeGate } from './auth/passcode-gate.js';
import { loadConfig, requireConfiguredGate } from './config.js';
import { CapacityPool, HoldStore } from './domain/capacity.js';
import { createOrder, transitionOrder } from './domain/orders.js';
import { AdmissionRegistry, generateTicketSigningKeyPair, TicketTokenService } from './domain/tickets.js';
import { exportReport, REPORT_DEFINITIONS } from './reporting/reports.js';
import { Outbox } from './offline/outbox.js';
import { YellowDogInventoryMirror } from './integrations/yellow-dog.js';
import { ConnectorRegistry } from './integrations/connector-registry.js';
import { GiftCardLedger } from './domain/gift-card-ledger.js';
import { ImportCenter } from './imports/import-center.js';
import { DomainError } from './errors.js';

const PUBLIC = new URL('../public/', import.meta.url);
const STATIC = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const BODY_LIMIT = 16 * 1024;
const COOKIE = 'synthetic_demo_session';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PRODUCTS = Object.freeze([
  { id: 'timed-demo', name: 'Timed Adventure — Synthetic', priceMinor: 2500, type: 'TIMED_ADMISSION' },
  { id: 'general-demo', name: 'General Admission — Synthetic', priceMinor: 1800, type: 'GENERAL_ADMISSION' },
]);

function securityHeaders(contentType) {
  return {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}

function send(res, status, value, extra = {}) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  res.writeHead(status, { ...securityHeaders(extra['content-type'] ?? 'application/json; charset=utf-8'), 'content-length': body.length, ...extra });
  res.end(body);
}

function cookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2));
}

async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] ?? ''))) throw new DomainError('UNSUPPORTED_MEDIA_TYPE');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new DomainError('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new DomainError('INVALID_JSON'); }
}

function publicOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch { return null; }
}

function sameOrigin(req, { trustProxy = false, externalOrigin = null } = {}) {
  const origin = req.headers.origin;
  if (!origin) return !req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']);
  let protocol = req.socket?.encrypted ? 'https' : 'http';
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
    if (forwarded === 'http' || forwarded === 'https') protocol = forwarded;
  }
  try {
    const requestOrigin = new URL(origin).origin;
    return requestOrigin === `${protocol}://${req.headers.host}` || requestOrigin === externalOrigin;
  }
  catch { return false; }
}

function createState({ now = () => Date.now() } = {}) {
  const holds = new HoldStore({ now });
  const pool = holds.addPool(new CapacityPool({ id: 'pool-demo', tenantId: 'tenant-demo', venueId: 'venue-demo', sessionId: 'session-demo', capacityTotal: 24, activeBlocks: 2 }));
  const { privateKey, publicKey } = generateTicketSigningKeyPair();
  const tokens = new TicketTokenService({ privateKey, publicKeys: new Map([['ephemeral-demo-key', publicKey]]), keyId: 'ephemeral-demo-key', now });
  const admissions = new AdmissionRegistry();
  const outbox = new Outbox({ originId: 'local-demo', now: () => new Date(now()) });
  const mirror = new YellowDogInventoryMirror({ now: () => new Date(now()) });
  mirror.applySourceRecords('items', [
    { id: 'yd-hard-hat', name: 'Synthetic Hard Hat', onHand: 12 },
    { id: 'yd-safety-vest', name: 'Synthetic Safety Vest', onHand: 8 },
  ]);
  const giftCards = new GiftCardLedger();
  giftCards.append({ cardId: 'GC-SYN-1001', type: 'ISSUED', amountMinor: 7500, idempotencyKey: 'fixture-gift-issue', reason: 'Synthetic opening liability', occurredAt: '2030-06-01T12:00:00.000Z' });
  giftCards.append({ cardId: 'GC-SYN-1001', type: 'REDEEMED', amountMinor: -1800, idempotencyKey: 'fixture-gift-redeem', reason: 'Synthetic admission redemption', occurredAt: '2030-06-01T13:00:00.000Z' });
  const connectors = new ConnectorRegistry({ now: () => new Date(now()).toISOString() });
  return { holds, pool, tokens, admissions, outbox, mirror, giftCards, connectors, imports: new ImportCenter(), orders: [], tickets: [], saleQueue: [], exportJobs: [], audit: [], createdAt: new Date(now()).toISOString(), now };
}

function csrfFor(token, secret) { return createHmac('sha256', secret).update(`csrf:${token}`).digest('base64url'); }
function authContext(req, gate, secret) {
  const token = cookies(req.headers.cookie)[COOKIE];
  const session = gate.inspect(token);
  if (!session.authenticated) throw new DomainError('AUTH_REQUIRED');
  return { token, csrf: csrfFor(token, secret) };
}
function snapshot(state, csrf) {
  const syntheticRecords = {
    customers: [{ id: 'CUS-SYN-001', reference: 'Synthetic household A', segment: 'Returning', waiverStatus: 'PLACEHOLDER_ONLY', pii: false }],
    memberships: [{ id: 'MEM-SYN-001', reference: 'Synthetic member A', plan: 'Builder Pass', status: 'ACTIVE_SYNTHETIC', renews: false }],
    staff: [{ id: 'ROLE-SYN-OPS', name: 'Floor lead role', coverage: '09:00–17:00', person: null }],
    tasks: [{ id: 'TASK-SYN-001', title: 'Complete opening readiness walk', status: 'IN_PROGRESS', ownerRole: 'Floor lead role' }],
    schedule: [
      { id: 'session-demo', startsAt: '2030-06-01T14:00:00.000Z', label: '10:00 AM Synthetic Session', product: 'Timed Adventure — Synthetic', status: 'ON_SALE' },
      { id: 'session-demo-2', startsAt: '2030-06-01T16:00:00.000Z', label: '12:00 PM Synthetic Session', product: 'Timed Adventure — Synthetic', status: 'LIMITED' },
    ],
  };
  return {
    synthetic: true,
    warning: 'NON-PRODUCTION / SYNTHETIC DATA ONLY',
    persistenceWarning: 'Per-instance, ephemeral serverless preview state. Unsuitable for real sales, capacity, tickets, or check-in.',
    csrf,
    products: PRODUCTS,
    session: { id: 'session-demo', label: '10:00 AM Synthetic Session', startsAt: '2030-06-01T14:00:00.000Z' },
    capacity: { total: state.pool.capacityTotal, blocked: state.pool.activeBlocks, held: state.pool.activeHolds, confirmed: state.pool.confirmed, available: state.pool.available, version: state.pool.version },
    holds: [...state.holds.holds.values()].map((hold) => ({ ...hold })),
    orders: state.orders,
    tickets: state.tickets.map(({ token: _token, ...ticket }) => ticket),
    admissions: state.admissions.attempts,
    offline: { pending: state.outbox.pending().length, mode: 'in-memory demonstration only' },
    integrations: {
      yellowDog: { mode: 'read-only mirror', items: state.mirror.list('items'), queuedSyntheticSales: state.saleQueue.length, delivery: 'disabled — queue display only' },
      splashRadio: { mode: 'manual-only', liveActions: false },
      migration: { mode: 'read-only synthetic preview', writeback: false },
      payment: { mode: 'disabled placeholder', collection: false },
    },
    reports: Object.entries(REPORT_DEFINITIONS).map(([id, report]) => ({ id, title: report.title, purpose: report.purpose })),
    ...syntheticRecords,
    giftCards: { cards: state.giftCards.cards(), entries: state.giftCards.entries(), chainValid: state.giftCards.verify() },
    importJobs: state.imports.history(),
    connectors: state.connectors.list(),
    connectorEvents: state.connectors.events(),
    exportJobs: state.exportJobs,
    audit: state.audit,
    summaries: {
      ticketsSold: state.orders.reduce((sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0),
      acceptedAdmissions: state.admissions.attempts.filter((attempt) => attempt.result === 'ACCEPTED').length,
      activeMemberships: syntheticRecords.memberships.filter((membership) => membership.status === 'ACTIVE_SYNTHETIC').length,
      giftLiabilityMinor: state.giftCards.cards().reduce((sum, card) => sum + card.balanceMinor, 0),
      inventoryUnits: state.mirror.list('items').reduce((sum, item) => sum + item.onHand, 0),
      openTasks: syntheticRecords.tasks.filter((task) => task.status !== 'DONE').length,
      importErrors: state.imports.history().reduce((sum, job) => sum + job.rejected, 0),
    },
  };
}
function reportRows(state, id) {
  const sold = state.orders.reduce((sum, order) => sum + order.lines[0].quantity, 0);
  if (id === 'today_at_a_glance') return [{ service_date: '2030-06-01', tickets_sold: sold, expected_arrivals: sold, accepted_checkins: state.admissions.attempts.filter((x) => x.result === 'ACCEPTED').length, refunded_minor: 0, currency: 'USD', remaining_capacity: state.pool.available, exception_count: 0 }];
  if (id === 'ticket_sales') return [{ service_date: '2030-06-01', product_id: 'timed-demo', session_id: 'session-demo', channel: 'SYNTHETIC_DEMO', tickets_sold: sold, gross_minor: state.orders.reduce((sum, x) => sum + x.totalMinor, 0), refunded_minor: 0, net_minor: state.orders.reduce((sum, x) => sum + x.totalMinor, 0), currency: 'USD' }];
  if (id === 'capacity_attendance') return [{ session_id: 'session-demo', starts_at: '2030-06-01T14:00:00.000Z', capacity_total: state.pool.capacityTotal, confirmed: state.pool.confirmed, active_holds: state.pool.activeHolds, active_blocks: state.pool.activeBlocks, remaining: state.pool.available, checked_in: state.admissions.attempts.filter((x) => x.result === 'ACCEPTED').length }];
  throw new DomainError('NOT_FOUND');
}

export function createDemoRequestHandler({ env = process.env, now = () => Date.now(), secureCookie = env.DEMO_COOKIE_SECURE === '1', trustProxy = false } = {}) {
  const config = loadConfig(env); const gateConfig = requireConfiguredGate(config);
  const externalOrigin = publicOrigin(env.PUBLIC_URL);
  const gate = new TemporaryPasscodeGate(gateConfig); const state = createState({ now });
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local.invalid');
      if (url.pathname.includes('..') || decodeURIComponent(url.pathname).includes('..')) throw new DomainError('NOT_FOUND');
      if (req.method === 'GET' && STATIC.has(url.pathname)) {
        const [filename, type] = STATIC.get(url.pathname); const bytes = await readFile(fileURLToPath(new URL(filename, PUBLIC)));
        return send(res, 200, bytes, { 'content-type': type });
      }
      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        if (!sameOrigin(req, { trustProxy, externalOrigin })) throw new DomainError('AUTH_FAILED');
        const sourceBucket = String(req.headers['x-forwarded-for'] ?? req.headers['x-real-ip'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim() || 'unknown';
        const body = await readJson(req);
        const session = await gate.authenticate({ passcode: body.passcode, sourceBucket, requestId: randomUUID() });
        const cookie = `${COOKIE}=${encodeURIComponent(session.token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie ? '; Secure' : ''}`;
        return send(res, 200, { authenticated: true, csrf: csrfFor(session.token, gateConfig.sessionSecret) }, { 'set-cookie': cookie });
      }
      if (url.pathname === '/api/auth/status' && req.method === 'GET') {
        const token = cookies(req.headers.cookie)[COOKIE];
        return send(res, 200, { authenticated: gate.inspect(token).authenticated });
      }
      if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { status: 'synthetic-preview', production: false, synthetic: true, persistence: 'per-instance-ephemeral' });
      const context = authContext(req, gate, gateConfig.sessionSecret);
      if (UNSAFE.has(req.method) && (!sameOrigin(req, { trustProxy, externalOrigin }) || req.headers['x-demo-csrf'] !== context.csrf)) throw new DomainError('REQUEST_REJECTED');
      if (url.pathname === '/api/state' && req.method === 'GET') return send(res, 200, snapshot(state, context.csrf));
      if (url.pathname === '/api/products' && req.method === 'GET') return send(res, 200, { items: PRODUCTS });
      if (url.pathname === '/api/sessions' && req.method === 'GET') return send(res, 200, { items: snapshot(state, context.csrf).schedule });
      if (url.pathname === '/api/orders' && req.method === 'GET') return send(res, 200, { items: state.orders });
      if (url.pathname === '/api/tickets' && req.method === 'GET') return send(res, 200, { items: snapshot(state, context.csrf).tickets });
      if (url.pathname === '/api/checkins' && req.method === 'GET') return send(res, 200, { items: state.admissions.attempts });
      if (url.pathname === '/api/imports' && req.method === 'GET') return send(res, 200, { items: state.imports.history() });
      if (url.pathname === '/api/connectors' && req.method === 'GET') return send(res, 200, { items: state.connectors.list(), events: state.connectors.events() });
      if (url.pathname === '/api/gift-cards' && req.method === 'GET') return send(res, 200, { cards: state.giftCards.cards(), entries: state.giftCards.entries(), chainValid: state.giftCards.verify() });
      if (url.pathname === '/api/imports/preview' && req.method === 'POST') {
        const body = await readJson(req);
        return send(res, 200, state.imports.preview({ entity: body.entity, format: body.format, content: body.content, mapping: body.mapping }));
      }
      if (url.pathname === '/api/imports/jobs' && req.method === 'POST') {
        const body = await readJson(req);
        const job = state.imports.createJob({ entity: body.entity, format: body.format, content: body.content, mapping: body.mapping, dryRun: body.dryRun !== false, idempotencyKey: String(req.headers['idempotency-key'] ?? ''), createdAt: new Date(now()).toISOString() });
        state.audit.push({ sequence: state.audit.length + 1, type: 'IMPORT_JOB_CREATED', aggregateId: job.id, at: job.createdAt, synthetic: true });
        return send(res, 201, { job, state: snapshot(state, context.csrf) });
      }
      const connectorMatch = url.pathname.match(/^\/api\/connectors\/(roller|stripe|yellowDog|splashRadio)\/simulate$/);
      if (connectorMatch && req.method === 'POST') {
        const body = await readJson(req);
        const connector = state.connectors.run(connectorMatch[1], body.scenario);
        state.audit.push({ sequence: state.audit.length + 1, type: 'CONNECTOR_SIMULATED', aggregateId: connector.id, at: connector.lastCheckedAt, synthetic: true });
        return send(res, 200, { connector, state: snapshot(state, context.csrf) });
      }
      if (url.pathname === '/api/gift-cards/entries' && req.method === 'POST') {
        const body = await readJson(req);
        const entry = state.giftCards.append({ cardId: body.cardId, type: body.type, amountMinor: body.amountMinor, reason: body.reason, idempotencyKey: String(req.headers['idempotency-key'] ?? ''), occurredAt: new Date(now()).toISOString() });
        state.audit.push({ sequence: state.audit.length + 1, type: 'GIFT_LEDGER_ENTRY_APPENDED', aggregateId: entry.cardId, at: entry.occurredAt, synthetic: true });
        return send(res, 201, { entry, balanceMinor: state.giftCards.balance(entry.cardId), state: snapshot(state, context.csrf) });
      }
      if (url.pathname === '/api/export-jobs' && req.method === 'POST') {
        const body = await readJson(req);
        if (!REPORT_DEFINITIONS[body.reportId]) throw new DomainError('VALIDATION_FAILED');
        const job = Object.freeze({ id: `export-${String(state.exportJobs.length + 1).padStart(4, '0')}`, reportId: body.reportId, status: 'QUEUED', downloadable: false, synthetic: true, createdAt: new Date(now()).toISOString() });
        state.exportJobs.push(job); return send(res, 202, { job, state: snapshot(state, context.csrf) });
      }
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        gate.revoke(context.token);
        return send(res, 200, { authenticated: false }, { 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie ? '; Secure' : ''}` });
      }
      if (url.pathname === '/api/holds' && req.method === 'POST') {
        const body = await readJson(req); const quantity = Number(body.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) throw new DomainError('VALIDATION_FAILED');
        const key = String(req.headers['idempotency-key'] ?? '');
        const hold = state.holds.createHold({ id: randomUUID(), poolId: state.pool.id, quantity, expiresAt: now() + 10 * 60_000, idempotencyKey: key });
        return send(res, 201, { hold, state: snapshot(state, context.csrf) });
      }
      if (url.pathname === '/api/orders' && req.method === 'POST') {
        const body = await readJson(req); const hold = state.holds.holds.get(body.holdId);
        if (!hold || hold.status !== 'ACTIVE') throw new DomainError('VALIDATION_FAILED');
        const product = PRODUCTS.find((item) => item.id === body.productId);
        if (!product) throw new DomainError('VALIDATION_FAILED');
        const order = createOrder({ id: randomUUID(), tenantId: 'tenant-demo', venueId: 'venue-demo', currency: 'USD', channel: 'SYNTHETIC_DEMO', lines: [{ productId: product.id, quantity: hold.quantity, unitAmountMinor: product.priceMinor }] });
        transitionOrder(order, 'PENDING_PAYMENT', 1); transitionOrder(order, 'CONFIRMED', 2);
        state.holds.transition({ holdId: hold.id, action: 'CONSUME', expectedVersion: hold.version, idempotencyKey: String(req.headers['idempotency-key'] ?? ''), orderId: order.id });
        const ticketId = randomUUID(); const issued = state.tokens.issue({ ticketId, venueId: 'venue-demo', sessionId: 'session-demo', validFrom: '2020-01-01T00:00:00Z', validUntil: '2100-01-01T00:00:00Z', maxEntries: hold.quantity });
        state.admissions.add(issued.ticket); state.orders.push(Object.freeze({ ...order }));
        const publicTicket = Object.freeze({ id: ticketId, orderId: order.id, maxEntries: hold.quantity, displayCode: `SYN-${ticketId.slice(0, 8).toUpperCase()}`, scannerCompatible: false });
        state.tickets.push(Object.freeze({ ...publicTicket, token: issued.token }));
        state.outbox.append({ eventType: 'synthetic.order.confirmed.v1', aggregateType: 'Order', aggregateId: order.id, aggregateVersion: order.version, payload: { totalMinor: order.totalMinor, synthetic: true }, idempotencyKey: `outbox-${order.id}` });
        state.saleQueue.push({ id: order.id, status: 'LOCAL_ONLY', destination: 'Yellow Dog disabled' });
        return send(res, 201, { order, ticket: publicTicket, payment: { status: 'DISABLED_PLACEHOLDER' }, state: snapshot(state, context.csrf) });
      }
      if (url.pathname === '/api/checkins' && req.method === 'POST') {
        const body = await readJson(req); const ticket = state.tickets.find((item) => item.id === body.ticketId);
        if (!ticket) throw new DomainError('NOT_FOUND');
        const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
        if (!idempotencyKey) throw new DomainError('VALIDATION_FAILED');
        const result = state.admissions.checkIn({ ticketId: ticket.id, idempotencyKey });
        return send(res, result.result === 'ACCEPTED' ? 201 : 409, { result, state: snapshot(state, context.csrf) });
      }
      const reportMatch = url.pathname.match(/^\/api\/reports\/([a-z_]+)\.(csv|json)$/);
      if (reportMatch && req.method === 'GET') {
        const artifact = exportReport({ reportId: reportMatch[1], rows: reportRows(state, reportMatch[1]), format: reportMatch[2] });
        return send(res, 200, artifact.bytes, { 'content-type': artifact.mediaType, 'content-disposition': `attachment; filename="${artifact.filename}"` });
      }
      throw new DomainError('NOT_FOUND');
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      console.error('synthetic_demo_request_failed', {
        code: error instanceof DomainError ? error.code : 'UNEXPECTED',
        name: error instanceof DomainError ? undefined : error?.name,
        message: error instanceof DomainError ? undefined : error?.message,
        method: req.method,
        path: String(req.url ?? '').split('?')[0],
      });
      const status = error.code === 'AUTH_REQUIRED' ? 401 : error.code === 'NOT_FOUND' ? 404 : error.code === 'UNSUPPORTED_MEDIA_TYPE' ? 415 : error.code === 'BODY_TOO_LARGE' ? 413 : ['CAPACITY_UNAVAILABLE', 'VERSION_CONFLICT'].includes(error.code) ? 409 : 400;
      send(res, status, { error: status === 401 ? 'Authentication required' : 'Request failed' });
    }
  };
  handler.demoState = state;
  return handler;
}

export function createDemoServer(options = {}) {
  const handler = createDemoRequestHandler(options);
  const server = createServer(handler);
  server.demoState = handler.demoState;
  return server;
}
