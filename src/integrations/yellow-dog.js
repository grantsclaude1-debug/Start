import { createHash, randomUUID } from 'node:crypto';
import { DomainError, assert } from '../errors.js';

const MIRRORED_RESOURCES = Object.freeze([
  'stores',
  'items',
  'vendors',
  'recipes',
  'purchaseOrders',
  'receipts',
  'transfers',
  'countSheets',
  'onHand',
]);

const DISABLED_WRITES = Object.freeze({
  items: false,
  vendors: false,
  purchaseOrders: false,
  receipts: false,
  receiptCommit: false,
  counts: false,
  waste: false,
  manualAdjustments: false,
  recipes: false,
  transfers: false,
});

const FINALIZED_SALE_LIFECYCLES = new Set(['completed', 'returned', 'voided', 'corrected']);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function payloadHash(payload) {
  return createHash('sha256').update(JSON.stringify(stableValue(payload))).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function immutableCopy(value) {
  return deepFreeze(structuredClone(value));
}

/**
 * Integration-owned, read-only projection. Yellow Dog remains authoritative;
 * absence from a refresh is not interpreted as deletion.
 */
export class YellowDogInventoryMirror {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.records = new Map(MIRRORED_RESOURCES.map((resource) => [resource, new Map()]));
  }

  semantics() {
    return Object.freeze({
      authority: 'yellow-dog',
      owner: 'local-integration',
      mode: 'read-only-mirror',
      absenceMeansDeleted: false,
      checkoutDependency: false,
    });
  }

  applySourceRecords(resource, rows, { syncedAt = this.now().toISOString() } = {}) {
    const collection = this.records.get(resource);
    assert(collection && Array.isArray(rows), 'VALIDATION_FAILED');
    const applied = [];
    for (const row of rows) {
      assert(row && typeof row.id === 'string' && row.id.length > 0, 'VALIDATION_FAILED');
      const mirrored = immutableCopy({
        ...structuredClone(row),
        mirror: { source: 'yellow-dog', authoritative: false, readOnly: true, syncedAt },
      });
      collection.set(row.id, mirrored);
      applied.push(mirrored);
    }
    return Object.freeze(applied);
  }

  get(resource, id) {
    const collection = this.records.get(resource);
    assert(collection, 'VALIDATION_FAILED');
    return collection.get(id) ?? null;
  }

  list(resource) {
    const collection = this.records.get(resource);
    assert(collection, 'VALIDATION_FAILED');
    return Object.freeze([...collection.values()]);
  }

  write() {
    throw new DomainError('INVENTORY_MIRROR_READ_ONLY');
  }

  deleteMissing() {
    throw new DomainError('INVENTORY_SOURCE_DELETION_UNVERIFIED');
  }
}

/**
 * Durable repository contract:
 *   repository.durability === 'durable'
 *   repository.putIfAbsent(key, value) atomically resolves to
 *     { inserted: true, value } or { inserted: false, value: existingValue }.
 */
export class YellowDogSalesOutbox {
  constructor({ repository, now = () => new Date(), id = randomUUID } = {}) {
    assert(repository?.durability === 'durable' && typeof repository.putIfAbsent === 'function', 'DURABLE_OUTBOX_REQUIRED');
    this.repository = repository;
    this.now = now;
    this.id = id;
  }

  async enqueue(sale, { idempotencyKey } = {}) {
    assert(sale && typeof sale === 'object' && idempotencyKey, 'VALIDATION_FAILED');
    assert(FINALIZED_SALE_LIFECYCLES.has(sale.lifecycle), 'SALE_NOT_FINALIZED');
    const hash = payloadHash(sale);
    const queued = immutableCopy({
      outboxId: this.id(),
      eventType: `venue.sale.${sale.lifecycle}`,
      destination: 'yellow-dog',
      idempotencyKey,
      payloadHash: hash,
      payload: structuredClone(sale),
      status: 'PENDING',
      attempts: 0,
      enqueuedAt: this.now().toISOString(),
    });
    const result = await this.repository.putIfAbsent(idempotencyKey, queued);
    assert(result && typeof result.inserted === 'boolean' && result.value, 'DURABLE_OUTBOX_INVALID_RESULT');
    if (!result.inserted && result.value.payloadHash !== hash) {
      throw new DomainError('IDEMPOTENCY_MISMATCH', 'The idempotency key already identifies a different finalized sale');
    }
    return Object.freeze({ queued: result.inserted, entry: immutableCopy(result.value) });
  }
}

/** Pure scheduling state for one Yellow Dog user; performs no sleeping or I/O. */
export class YellowDogRateLimitScheduler {
  constructor({ userId, requestsPerSecond = 2 } = {}) {
    assert(userId && requestsPerSecond > 0 && requestsPerSecond <= 2, 'VALIDATION_FAILED');
    this.userId = userId;
    this.minimumSpacingMs = 1000 / requestsPerSecond;
    this.lastScheduledAtMs = null;
    this.retryAfterUntilMs = 0;
  }

  honorRetryAfter(retryAfter, nowMs) {
    assert(Number.isFinite(nowMs), 'VALIDATION_FAILED');
    let until;
    if (typeof retryAfter === 'number' || /^\d+(?:\.\d+)?$/.test(String(retryAfter))) {
      until = nowMs + Number(retryAfter) * 1000;
    } else {
      until = Date.parse(retryAfter);
    }
    assert(Number.isFinite(until), 'INVALID_RETRY_AFTER');
    this.retryAfterUntilMs = Math.max(this.retryAfterUntilMs, until);
    return this.retryAfterUntilMs;
  }

  schedule(nowMs) {
    assert(Number.isFinite(nowMs), 'VALIDATION_FAILED');
    const spacedAt = this.lastScheduledAtMs === null ? nowMs : this.lastScheduledAtMs + this.minimumSpacingMs;
    const scheduledAtMs = Math.max(nowMs, spacedAt, this.retryAfterUntilMs);
    this.lastScheduledAtMs = scheduledAtMs;
    return Object.freeze({ userId: this.userId, scheduledAtMs });
  }
}

export class YellowDogAdapter {
  constructor({ enabled = false, vendorVerified = false, certifiedReads = [], certifiedWrites = [], salesOutbox = null } = {}) {
    this.enabled = enabled;
    this.vendorVerified = vendorVerified;
    this.certifiedReads = new Set(certifiedReads);
    this.certifiedWrites = new Set(certifiedWrites);
    this.salesOutbox = salesOutbox;
  }

  capabilities() {
    const active = this.enabled && this.vendorVerified;
    const reads = Object.freeze(Object.fromEntries(MIRRORED_RESOURCES.map((name) => [name, active && this.certifiedReads.has(name)])));
    const sales = active && this.certifiedWrites.has('sales') && this.salesOutbox instanceof YellowDogSalesOutbox;
    return Object.freeze({
      enabled: this.enabled,
      inventoryAuthority: 'yellow-dog',
      localInventoryRole: 'integration-owned-read-only-mirror',
      transport: active ? 'certified-unconfigured' : 'unconfigured',
      publicRateLimitRequestsPerSecondPerUser: 2,
      reads,
      writes: Object.freeze({ sales, ...DISABLED_WRITES }),
      salesDelivery: 'asynchronous-durable-outbox',
      webhooks: false,
      // Compatibility aliases for the original scaffold surface.
      salesWrite: sales,
      itemWrite: false,
      vendorWrite: false,
      purchaseOrderWrite: false,
      receiptCommit: false,
      transferWrite: false,
      countWrite: false,
      recipeWrite: false,
    });
  }

  async pull(resource) {
    if (!this.capabilities().reads[resource]) throw new DomainError('INVENTORY_READ_DISABLED');
    throw new DomainError('NOT_IMPLEMENTED');
  }

  async enqueueFinalizedSale(sale, options) {
    if (!this.capabilities().writes.sales) throw new DomainError('INVENTORY_WRITE_DISABLED');
    return this.salesOutbox.enqueue(sale, options);
  }

  async pushSales(batch) {
    if (!this.capabilities().writes.sales) throw new DomainError('INVENTORY_WRITE_DISABLED');
    assert(Array.isArray(batch), 'VALIDATION_FAILED');
    return Promise.all(batch.map(({ sale, idempotencyKey }) => this.salesOutbox.enqueue(sale, { idempotencyKey })));
  }

  async writeUnverifiedCapability() {
    throw new DomainError('INVENTORY_WRITE_DISABLED');
  }
}
