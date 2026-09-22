import { createHash } from 'node:crypto';
import { DomainError } from '../errors.js';

const MAX_ROWS = 500;
const MAX_TEXT = 256 * 1024;
const ALLOWED = Object.freeze({
  products: ['sourceId', 'name', 'priceMinor', 'active'],
  customers: ['sourceId', 'reference', 'segment'],
  memberships: ['sourceId', 'reference', 'status', 'expiresOn'],
  inventory: ['sourceId', 'name', 'onHand'],
});
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const cell = (value) => String(value ?? '').trim();
export const neutralizeFormula = (value) => /^[=+\-@]/.test(String(value)) ? `'${value}` : String(value);

export function parseCsv(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_TEXT) throw new DomainError('IMPORT_TOO_LARGE');
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new DomainError('INVALID_IMPORT');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const nonblank = rows.filter((item) => item.some((value) => value.trim()));
  if (nonblank.length < 2 || nonblank.length - 1 > MAX_ROWS) throw new DomainError('INVALID_IMPORT');
  const headers = nonblank[0].map(cell);
  if (new Set(headers).size !== headers.length || headers.some((value) => !value)) throw new DomainError('INVALID_IMPORT');
  return nonblank.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, cell(values[index])])));
}

function normalizeInput({ format, content }) {
  if (!['csv', 'json'].includes(format) || typeof content !== 'string' || Buffer.byteLength(content) > MAX_TEXT) throw new DomainError('IMPORT_TOO_LARGE');
  if (format === 'csv') return parseCsv(content);
  let rows; try { rows = JSON.parse(content); } catch { throw new DomainError('INVALID_IMPORT'); }
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS || rows.some((row) => !row || Array.isArray(row) || typeof row !== 'object')) throw new DomainError('INVALID_IMPORT');
  return rows;
}

export class ImportCenter {
  #jobs = [];
  #keys = new Map();

  preview({ entity, format, content, mapping = {} }) {
    if (!ALLOWED[entity]) throw new DomainError('VALIDATION_FAILED');
    const rows = normalizeInput({ format, content });
    const mapped = rows.map((row, index) => {
      const record = {};
      for (const field of ALLOWED[entity]) {
        const source = mapping[field] || field;
        if (Object.hasOwn(row, source)) record[field] = typeof row[source] === 'string' ? neutralizeFormula(cell(row[source])) : row[source];
      }
      const errors = [];
      if (!cell(record.sourceId)) errors.push('sourceId is required');
      if (['products', 'inventory'].includes(entity) && !cell(record.name)) errors.push('name is required');
      if (entity === 'products' && !Number.isSafeInteger(Number(record.priceMinor))) errors.push('priceMinor must be an integer');
      if (entity === 'inventory' && !Number.isSafeInteger(Number(record.onHand))) errors.push('onHand must be an integer');
      return { row: index + 2, record, errors };
    });
    const sourceHash = createHash('sha256').update(stable({ entity, format, rows, mapping })).digest('hex');
    return { entity, format, sourceHash, fields: ALLOWED[entity], rowCount: mapped.length, validCount: mapped.filter((row) => !row.errors.length).length, errorCount: mapped.filter((row) => row.errors.length).length, rows: mapped.slice(0, 25), truncated: mapped.length > 25 };
  }

  createJob({ entity, format, content, mapping = {}, dryRun = true, idempotencyKey, createdAt = new Date().toISOString() }) {
    if (!idempotencyKey) throw new DomainError('VALIDATION_FAILED');
    const preview = this.preview({ entity, format, content, mapping });
    const command = stable({ sourceHash: preview.sourceHash, dryRun: Boolean(dryRun) });
    const existing = this.#keys.get(idempotencyKey);
    if (existing) {
      if (existing.command !== command) throw new DomainError('IDEMPOTENCY_MISMATCH');
      return existing.job;
    }
    const sequence = this.#jobs.length + 1;
    const job = Object.freeze({ id: `import-${String(sequence).padStart(4, '0')}`, sequence, entity, format, dryRun: Boolean(dryRun), sourceHash: preview.sourceHash, status: preview.errorCount ? 'VALIDATION_FAILED' : dryRun ? 'DRY_RUN_COMPLETE' : 'COMPLETED_LOCAL', rowCount: preview.rowCount, accepted: preview.validCount, rejected: preview.errorCount, errors: preview.rows.filter((row) => row.errors.length).map(({ row, errors }) => ({ row, errors })), createdAt, writeback: false, providerCalls: 0 });
    this.#jobs.push(job); this.#keys.set(idempotencyKey, { command, job }); return job;
  }
  history() { return Object.freeze(this.#jobs.map((job) => ({ ...job }))); }
}
