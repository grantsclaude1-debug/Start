import { DomainError } from '../errors.js';

const DEFINITIONS = Object.freeze({
  roller: { name: 'ROLLER migration', mode: 'READ_ONLY', description: 'Synthetic paginated migration boundary. Source writeback is prohibited.' },
  stripe: { name: 'Stripe', mode: 'DISABLED', description: 'No card entry, authorization, capture, refund, webhook, Terminal, or provider call.' },
  yellowDog: { name: 'Yellow Dog', mode: 'READ_ONLY', description: 'Synthetic inventory mirror. Every vendor write remains disabled.' },
  splashRadio: { name: 'Splash Radio', mode: 'MANUAL_ONLY', description: 'Local configuration notes only. Playback and provider actions are unavailable.' },
});

export class ConnectorRegistry {
  #states = new Map();
  #events = [];
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
    for (const [id, definition] of Object.entries(DEFINITIONS)) this.#states.set(id, { id, ...definition, status: id === 'stripe' ? 'BLOCKED' : 'READY_LOCAL', scenario: 'healthy', attempts: 0, nextRetryAt: null, lastResult: 'Not run', providerCalls: 0 });
  }
  list() { return [...this.#states.values()].map((value) => ({ ...value })); }
  run(id, scenario = 'healthy') {
    const state = this.#states.get(id);
    if (!state || !['healthy', 'rate_limited', 'mapping_error', 'token_expired', 'partial_batch', 'empty'].includes(scenario)) throw new DomainError('VALIDATION_FAILED');
    const attempts = state.attempts + 1;
    const result = {
      healthy: ['READY_LOCAL', 'Synthetic boundary check passed'], rate_limited: ['RETRY_QUEUED', 'Synthetic HTTP 429; deterministic retry queued'], mapping_error: ['NEEDS_MAPPING', 'Synthetic source field requires mapping'], token_expired: ['AUTH_BLOCKED', 'Synthetic token expired; no credential requested'], partial_batch: ['PARTIAL', 'Synthetic page 2 of 3 stopped before acknowledgement'], empty: ['EMPTY', 'No synthetic records returned'],
    }[scenario];
    Object.assign(state, { scenario, attempts, status: result[0], lastResult: result[1], lastCheckedAt: this.now(), nextRetryAt: scenario === 'rate_limited' ? new Date(Date.parse(this.now()) + 60_000).toISOString() : null, providerCalls: 0 });
    this.#events.push(Object.freeze({ sequence: this.#events.length + 1, connectorId: id, scenario, status: state.status, at: state.lastCheckedAt, providerCalls: 0 }));
    return { ...state };
  }
  events() { return this.#events.map((event) => ({ ...event })); }
}
