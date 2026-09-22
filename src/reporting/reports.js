import { createHash } from 'node:crypto';
import { DomainError, assert } from '../errors.js';

export const REPORT_DEFINITIONS = Object.freeze({
  today_at_a_glance: Object.freeze({ title: 'Today at a glance', purpose: 'Shows tickets sold, expected arrivals, accepted check-ins, refunds, remaining capacity, and exceptions for one service date.', columns: ['service_date', 'tickets_sold', 'expected_arrivals', 'accepted_checkins', 'refunded_minor', 'currency', 'remaining_capacity', 'exception_count'] }),
  ticket_sales: Object.freeze({ title: 'Ticket sales', purpose: 'Shows ticket quantity and sales by service date, product, session, and channel.', columns: ['service_date', 'product_id', 'session_id', 'channel', 'tickets_sold', 'gross_minor', 'refunded_minor', 'net_minor', 'currency'] }),
  capacity_attendance: Object.freeze({ title: 'Capacity and attendance', purpose: 'Shows total, confirmed, held, blocked, remaining, and checked-in counts by session.', columns: ['session_id', 'starts_at', 'capacity_total', 'confirmed', 'active_holds', 'active_blocks', 'remaining', 'checked_in'] })
});

const csvCell = (value) => { let text = value == null ? '' : String(value); if (/^[=+\-@]/.test(text)) text = `'${text}`; return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };

export class ExportJobStore {
  constructor({ now = () => new Date().toISOString() } = {}) { this.now = now; this.jobs = []; this.keys = new Map(); }
  create({ reportId, format = 'csv', idempotencyKey }) { assert(REPORT_DEFINITIONS[reportId] && ['csv', 'json'].includes(format) && idempotencyKey, 'VALIDATION_FAILED'); const fingerprint = `${reportId}:${format}`; const prior = this.keys.get(idempotencyKey); if (prior) { if (prior.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_MISMATCH'); return prior.job; } const job = Object.freeze({ id: `export-${String(this.jobs.length + 1).padStart(4, '0')}`, reportId, format, status: 'QUEUED', downloadable: false, createdAt: this.now(), providerCalls: 0 }); this.jobs.push(job); this.keys.set(idempotencyKey, { fingerprint, job }); return job; }
  progress(id, status) { const index = this.jobs.findIndex((job) => job.id === id); if (index < 0) throw new DomainError('NOT_FOUND'); if (!['RUNNING', 'RENDERED', 'FAILED', 'EXPIRED'].includes(status)) throw new DomainError('INVALID_TRANSITION'); const current = this.jobs[index]; const allowed = { QUEUED: ['RUNNING', 'FAILED'], RUNNING: ['RENDERED', 'FAILED'], RENDERED: ['EXPIRED'], FAILED: [], EXPIRED: [] }; if (!allowed[current.status].includes(status)) throw new DomainError('INVALID_TRANSITION'); const job = Object.freeze({ ...current, status, downloadable: false, updatedAt: this.now() }); this.jobs[index] = job; return job; }
  list() { return this.jobs.map((job) => ({ ...job })); }
}

export function exportReport({ reportId, rows, format, generatedAt = new Date().toISOString(), filters = {} }) {
  const definition = REPORT_DEFINITIONS[reportId]; assert(definition, 'NOT_FOUND'); assert(Array.isArray(rows), 'VALIDATION_FAILED');
  for (const row of rows) for (const column of definition.columns) if (!(column in row)) throw new DomainError('REPORT_SCHEMA_MISMATCH', `Missing ${column}`);
  let mediaType, filename, body;
  if (format === 'csv') { mediaType = 'text/csv; charset=utf-8'; filename = `${reportId}.csv`; body = `${definition.columns.join(',')}\n${rows.map((row) => definition.columns.map((column) => csvCell(row[column])).join(',')).join('\n')}${rows.length ? '\n' : ''}`; }
  else if (format === 'json') { mediaType = 'application/json'; filename = `${reportId}.json`; body = `${JSON.stringify({ reportId, title: definition.title, purpose: definition.purpose, generatedAt, filters, rowCount: rows.length, rows }, null, 2)}\n`; }
  else throw new DomainError('VALIDATION_FAILED', 'Format must be csv or json');
  const bytes = Buffer.from(body);
  return Object.freeze({ reportId, title: definition.title, purpose: definition.purpose, generatedAt, filters: Object.freeze({ ...filters }), rowCount: rows.length, mediaType, filename, sha256: createHash('sha256').update(bytes).digest('hex'), bytes });
}
