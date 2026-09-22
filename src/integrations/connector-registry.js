import { DomainError } from '../errors.js';

const TABS = Object.freeze(['Overview', 'Configuration', 'Capabilities', 'Mappings', 'Queue', 'Health', 'Reconciliation', 'Audit']);
const DEFINITIONS = Object.freeze({
  stripe: { name: 'Stripe', kind: 'PAYMENTS', mode: 'DISABLED', capabilities: ['payment.fixture', 'refund.fixture', 'dispute.fixture', 'payout.fixture'], description: 'Deterministic payment, refund, dispute, and payout fixtures. No raw cards or provider calls.' },
  yellowDog: { name: 'Yellow Dog', kind: 'INVENTORY', mode: 'DRY_RUN', capabilities: ['inventory.read.fixture', 'sale.finalized.dry_run'], description: 'Read-only fixture mirror and dry-run finalized-sale queue. Vendor writes are unreachable.' },
  roller: { name: 'ROLLER migration', kind: 'MIGRATION', mode: 'FIXTURE', capabilities: ['source.read.fixture', 'migration.rehearsal'], description: 'Synthetic paginated read-only rehearsal. Source mutation and generic requests are prohibited.' },
  splashRadio: { name: 'Splash Radio', kind: 'AUDIO', mode: 'MANUAL', capabilities: ['manual.task', 'manual.acknowledgement'], description: 'Manual task and acknowledgement only. No playback or provider action.' },
  offlineOutbox: { name: 'Offline outbox', kind: 'OFFLINE', mode: 'FIXTURE', capabilities: ['duplicate.fixture', 'gap.fixture', 'conflict.fixture', 'expiry.fixture'], description: 'Local duplicate, sequence-gap, conflict, and expiry simulations.' },
  reports: { name: 'Reports', kind: 'REPORTING', mode: 'DRY_RUN', capabilities: ['report.read', 'export.render'], description: 'Plain-language reports and asynchronous non-downloadable export jobs.' },
  resend: { name: 'Resend', kind: 'MESSAGING', mode: 'DISABLED', capabilities: [], description: 'Disabled placeholder; no outbound messages.' },
  kds: { name: 'KDS', kind: 'KITCHEN', mode: 'DISABLED', capabilities: [], description: 'Disabled placeholder; no kitchen messages.' },
  campaignMonitor: { name: 'Campaign Monitor', kind: 'MARKETING', mode: 'DISABLED', capabilities: [], description: 'Disabled placeholder; no audience data.' },
  groupon: { name: 'Groupon', kind: 'CHANNEL', mode: 'DISABLED', capabilities: [], description: 'Disabled placeholder; no voucher or settlement traffic.' },
  xero: { name: 'Xero', kind: 'ACCOUNTING', mode: 'DISABLED', capabilities: [], description: 'Disabled placeholder; no accounting posts.' },
  genericWebhooks: { name: 'Generic webhooks', kind: 'WEBHOOK', mode: 'DISABLED', capabilities: [], description: 'Disabled placeholder; no generic request proxy.' },
});
const SCENARIOS = new Set(['healthy', 'rate_limited', 'mapping_error', 'token_expired', 'partial_batch', 'empty', 'duplicate', 'gap', 'conflict', 'expired']);
const immutable = (value) => Object.freeze(structuredClone(value));

export class ConnectorRegistry {
  #states = new Map(); #commands = []; #attempts = []; #acknowledgements = []; #exceptions = []; #reconciliations = []; #keys = new Map();
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
    for (const [id, definition] of Object.entries(DEFINITIONS)) this.#states.set(id, { id, ...definition, status: definition.mode === 'DISABLED' ? 'BLOCKED' : 'READY_LOCAL', mappingVersion: 1, checkpoint: null, health: definition.mode === 'DISABLED' ? 'NOT_CONFIGURED' : 'LOCAL_ONLY', queueMetrics: { draft: 0, queued: 0, exceptions: 0 }, attempts: 0, nextRetryAt: null, lastResult: 'Not run', providerCalls: 0, tabs: TABS, credentials: { status: 'MISSING_SECRET_REFERENCE', valuePresent: false } });
  }
  list() { return [...this.#states.values()].map((value) => structuredClone(value)); }
  get(id) { const state = this.#states.get(id); if (!state) throw new DomainError('NOT_FOUND'); return structuredClone(state); }
  command({ connectionId, capability, payload = {}, idempotencyKey, mode = 'DRY_RUN' }) {
    const state = this.#states.get(connectionId); if (!state || !idempotencyKey) throw new DomainError('VALIDATION_FAILED');
    if ((state.mode === 'DISABLED' && connectionId !== 'stripe') || mode === 'LIVE') throw new DomainError('INTEGRATION_MODE_UNREACHABLE');
    if (!['FIXTURE', 'DRY_RUN', 'MANUAL'].includes(mode) || (mode === 'MANUAL' && connectionId !== 'splashRadio')) throw new DomainError('INTEGRATION_MODE_UNREACHABLE');
    if (!state.capabilities.includes(capability)) throw new DomainError('INTEGRATION_CAPABILITY_UNSUPPORTED');
    const fingerprint = JSON.stringify({ connectionId, capability, payload, mode }); const prior = this.#keys.get(idempotencyKey);
    if (prior) { if (prior.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_MISMATCH'); return prior.command; }
    const command = immutable({ id: `command-${String(this.#commands.length + 1).padStart(4, '0')}`, sequence: this.#commands.length + 1, connectionId, capability, mode, payload, status: 'DRAFT', mappingVersion: state.mappingVersion, createdAt: this.now(), immutable: true, providerCalls: 0 });
    this.#commands.push(command); this.#keys.set(idempotencyKey, { fingerprint, command }); state.queueMetrics.draft += 1; return command;
  }
  renderCommand(commandId, { scenario = 'healthy' } = {}) {
    const source = this.#commands.find((item) => item.id === commandId); if (!source || !SCENARIOS.has(scenario)) throw new DomainError('VALIDATION_FAILED');
    const state = this.#states.get(source.connectionId); let status = 'RENDERED', code = 'FIXTURE_RENDERED';
    if (scenario === 'mapping_error') { status = 'REJECTED'; code = 'MAPPING_MISSING'; }
    const command = immutable({ ...source, status, lifecycle: status === 'RENDERED' ? ['DRAFT', 'VALIDATED', 'DRY_RUN_QUEUED', 'RENDERED'] : ['DRAFT', 'VALIDATED', 'REJECTED'], renderedAt: this.now(), providerCalls: 0 });
    this.#commands[this.#commands.indexOf(source)] = command; state.queueMetrics.draft = Math.max(0, state.queueMetrics.draft - 1); state.queueMetrics.queued += status === 'RENDERED' ? 1 : 0;
    const attempt = immutable({ id: `attempt-${this.#attempts.length + 1}`, commandId, connectionId: source.connectionId, scenario, result: code, retryable: false, at: this.now(), providerCalls: 0 }); this.#attempts.push(attempt);
    if (status === 'REJECTED') this.#openException(source.connectionId, commandId, code);
    else this.#acknowledgements.push(immutable({ id: `ack-${this.#acknowledgements.length + 1}`, commandId, result: source.mode === 'MANUAL' ? 'MANUAL_ACKNOWLEDGEMENT_REQUIRED' : 'DRY_RUN_RENDERED', at: this.now(), providerCalls: 0 }));
    this.#reconcile(source.connectionId); return command;
  }
  run(id, scenario = 'healthy') {
    const state = this.#states.get(id); if (!state || !SCENARIOS.has(scenario)) throw new DomainError('VALIDATION_FAILED');
    if (state.mode === 'DISABLED') return { ...state };
    const result = {
      healthy: ['READY_LOCAL', 'Synthetic boundary check passed'], rate_limited: ['RETRY_QUEUED', 'Synthetic HTTP 429; deterministic retry queued'], mapping_error: ['NEEDS_MAPPING', 'Synthetic source field requires mapping'], token_expired: ['AUTH_BLOCKED', 'Synthetic token expired; no credential requested'], partial_batch: ['PARTIAL', 'Synthetic page 2 of 3 stopped before acknowledgement'], empty: ['EMPTY', 'No synthetic records returned'], duplicate: ['DUPLICATE', 'Duplicate fixture preserved with no repeated effect'], gap: ['SEQUENCE_GAP', 'Sequence gap quarantined'], conflict: ['CONFLICT', 'Conflicting fixture quarantined'], expired: ['EXPIRED', 'Expired fixture requires review'],
    }[scenario];
    Object.assign(state, { scenario, attempts: state.attempts + 1, status: result[0], lastResult: result[1], lastCheckedAt: this.now(), nextRetryAt: scenario === 'rate_limited' ? new Date(Date.parse(this.now()) + 60_000).toISOString() : null, providerCalls: 0, checkpoint: scenario === 'healthy' ? `fixture:${state.attempts + 1}` : state.checkpoint });
    const attempt = immutable({ id: `attempt-${this.#attempts.length + 1}`, sequence: this.#attempts.length + 1, connectorId: id, connectionId: id, scenario, status: state.status, result: state.lastResult, retryable: scenario === 'rate_limited', at: state.lastCheckedAt, providerCalls: 0 }); this.#attempts.push(attempt);
    if (['mapping_error', 'token_expired', 'partial_batch', 'gap', 'conflict', 'expired'].includes(scenario)) this.#openException(id, attempt.id, state.status);
    this.#reconcile(id); return structuredClone(state);
  }
  events() { return this.#attempts.map((event) => structuredClone(event)); }
  records(connectionId) { const filter = (items) => items.filter((item) => !connectionId || item.connectionId === connectionId || this.#commands.find((command) => command.id === item.commandId)?.connectionId === connectionId).map((item) => structuredClone(item)); return { commands: filter(this.#commands), attempts: filter(this.#attempts), acknowledgements: filter(this.#acknowledgements), exceptions: filter(this.#exceptions), reconciliations: filter(this.#reconciliations) }; }
  processRetries(at = this.now()) { const nowMs = Date.parse(at); const processed = []; for (const state of this.#states.values()) if (state.status === 'RETRY_QUEUED' && Date.parse(state.nextRetryAt) <= nowMs) { state.status = 'READY_LOCAL'; state.nextRetryAt = null; state.lastResult = 'Deterministic retry completed locally'; state.providerCalls = 0; processed.push(state.id); } return processed; }
  #openException(connectionId, sourceId, code) { const exception = immutable({ id: `integration-exception-${this.#exceptions.length + 1}`, connectionId, sourceId, code, status: 'OPEN', at: this.now(), providerCalls: 0 }); this.#exceptions.push(exception); this.#states.get(connectionId).queueMetrics.exceptions += 1; }
  #reconcile(connectionId) { const commands = this.#commands.filter((item) => item.connectionId === connectionId); const acknowledgements = this.#acknowledgements.filter((ack) => commands.some((command) => command.id === ack.commandId)); this.#reconciliations.push(immutable({ id: `reconciliation-${this.#reconciliations.length + 1}`, connectionId, commandCount: commands.length, acknowledgementCount: acknowledgements.length, openExceptions: this.#exceptions.filter((item) => item.connectionId === connectionId && item.status === 'OPEN').length, balanced: commands.filter((item) => item.status === 'RENDERED').length === acknowledgements.length, at: this.now(), providerCalls: 0 })); }
}
