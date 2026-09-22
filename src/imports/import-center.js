import { createHash } from 'node:crypto';
import { DomainError } from '../errors.js';

const MAX_ROWS = 500;
const MAX_TEXT = 256 * 1024;
const TEMPLATE_FIELDS = Object.freeze({
  products: ['sourceId', 'name', 'priceMinor', 'active'],
  sessions: ['sourceId', 'productSourceId', 'startsAt', 'endsAt', 'capacity'],
  orders: ['sourceId', 'sessionSourceId', 'quantity', 'totalMinor', 'status'],
  tickets: ['sourceId', 'orderSourceId', 'sessionSourceId', 'maxEntries', 'status'],
  customers: ['sourceId', 'reference', 'segment'],
  memberships: ['sourceId', 'reference', 'status', 'expiresOn'],
  giftCards: ['sourceId', 'balanceMinor', 'status'],
  inventoryReferences: ['sourceId', 'name', 'onHand'],
  waivers: ['sourceId', 'ticketSourceId', 'templateVersion', 'status'],
  checkIns: ['sourceId', 'ticketSourceId', 'occurredAt', 'result'],
});
const MONEY_FIELDS = new Set(['priceMinor', 'totalMinor', 'balanceMinor']);
const INTEGER_FIELDS = new Set(['capacity', 'quantity', 'maxEntries', 'onHand', ...MONEY_FIELDS]);
const SAFE_TRANSFORMS = new Set(['TRIM', 'UPPERCASE', 'LOWERCASE', 'INTEGER', 'BOOLEAN']);
const stableValue = (value) => Array.isArray(value) ? value.map(stableValue) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])) : value;
const stable = (value) => JSON.stringify(stableValue(value));
const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
const cell = (value) => String(value ?? '').trim();
export const neutralizeFormula = (value) => /^[=+\-@]/.test(String(value)) ? `'${value}` : String(value);

export const IMPORT_TEMPLATES = Object.freeze(Object.entries(TEMPLATE_FIELDS).map(([id, fields]) => Object.freeze({ id, label: id.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase()), fields: Object.freeze([...fields]), syntheticCommitAllowed: true })));

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

function parseInput(format, content) {
  if (!['csv', 'json', 'ndjson'].includes(format) || typeof content !== 'string') throw new DomainError('INVALID_IMPORT');
  if (Buffer.byteLength(content) > MAX_TEXT) throw new DomainError('IMPORT_TOO_LARGE');
  if (format === 'csv') return parseCsv(content);
  let rows;
  try { rows = format === 'json' ? JSON.parse(content) : content.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line)); }
  catch { throw new DomainError('INVALID_IMPORT'); }
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS || rows.some((row) => !row || Array.isArray(row) || typeof row !== 'object')) throw new DomainError('INVALID_IMPORT');
  return rows;
}

function detectSensitive(value) {
  const text = String(value ?? '');
  if (/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{10,}\b|\b(?:bearer|access[_ -]?token|api[_ -]?key|secret)\s*[:=]\s*\S+/i.test(text)) return 'SECRET_DETECTED';
  const digits = text.replace(/[ -]/g, '');
  if (/^\d{13,19}$/.test(digits) && luhn(digits)) return 'PAYMENT_CARD_DETECTED';
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) || /(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/.test(text)) return 'REAL_PII_DETECTED';
  return null;
}
function luhn(text) { let sum = 0, even = false; for (let i = text.length - 1; i >= 0; i -= 1) { let digit = Number(text[i]); if (even && (digit *= 2) > 9) digit -= 9; sum += digit; even = !even; } return sum % 10 === 0; }
function applyTransform(value, transform) {
  if (!transform) return value;
  if (!SAFE_TRANSFORMS.has(transform)) throw new DomainError('IMPORT_TRANSFORM_NOT_ALLOWED');
  if (transform === 'TRIM') return cell(value);
  if (transform === 'UPPERCASE') return cell(value).toUpperCase();
  if (transform === 'LOWERCASE') return cell(value).toLowerCase();
  if (transform === 'INTEGER') return Number(cell(value));
  if (transform === 'BOOLEAN') return ['true', '1', 'yes', 'active'].includes(cell(value).toLowerCase());
  return value;
}

export class ImportCenter {
  #uploads = new Map(); #mappings = new Map(); #jobs = []; #keys = new Map(); #provenance = new Map(); #records = new Map();
  templates() { return IMPORT_TEMPLATES.map((template) => ({ ...template, fields: [...template.fields] })); }
  upload({ entity, format, content, provenance = 'local-browser', sourceVersion = '1' }) {
    if (!TEMPLATE_FIELDS[entity]) throw new DomainError('VALIDATION_FAILED');
    const rows = parseInput(format, content); const sourceHash = digest(content);
    const id = `upload-${String(this.#uploads.size + 1).padStart(4, '0')}`;
    const upload = { id, entity, format, content, rows, sourceHash, provenance: cell(provenance), sourceVersion: cell(sourceVersion), status: 'UPLOADED', createdSequence: this.#uploads.size + 1 };
    if (!upload.provenance || !upload.sourceVersion) throw new DomainError('VALIDATION_FAILED');
    this.#uploads.set(id, upload); return this.#publicUpload(upload);
  }
  detect(uploadId) {
    const upload = this.#requireUpload(uploadId); const fields = [...new Set(upload.rows.flatMap((row) => Object.keys(row)))].sort();
    return { uploadId, entity: upload.entity, format: upload.format, sourceHash: upload.sourceHash, rowCount: upload.rows.length, detectedFields: fields, requiredFields: [...TEMPLATE_FIELDS[upload.entity]] };
  }
  createMapping({ uploadId, fields = {}, constants = {}, transforms = {}, ignored = [], version = 1 }) {
    const upload = this.#requireUpload(uploadId); const sourceFields = this.detect(uploadId).detectedFields; const targets = TEMPLATE_FIELDS[upload.entity];
    if (!Number.isSafeInteger(version) || version < 1) throw new DomainError('VALIDATION_FAILED');
    for (const [target, source] of Object.entries(fields)) if (!targets.includes(target) || !sourceFields.includes(source)) throw new DomainError('IMPORT_MAPPING_INVALID');
    for (const target of Object.keys(constants)) if (!targets.includes(target)) throw new DomainError('IMPORT_MAPPING_INVALID');
    for (const [target, transform] of Object.entries(transforms)) if (!targets.includes(target) || !SAFE_TRANSFORMS.has(transform)) throw new DomainError('IMPORT_TRANSFORM_NOT_ALLOWED');
    const used = new Set(Object.values(fields)); const ignoredSet = new Set(ignored);
    if (sourceFields.some((field) => !used.has(field) && !ignoredSet.has(field))) throw new DomainError('IMPORT_UNKNOWN_FIELD_REQUIRES_IGNORE');
    const id = `mapping-${upload.entity}-v${version}-${digest({ fields, constants, transforms, ignored: [...ignored].sort() }).slice(0, 8)}`;
    const mapping = Object.freeze({ id, uploadId, entity: upload.entity, version, fields: { ...fields }, constants: { ...constants }, transforms: { ...transforms }, ignored: Object.freeze([...ignored].sort()) });
    this.#mappings.set(id, mapping); return mapping;
  }
  validate(uploadId, mappingId) {
    const upload = this.#requireUpload(uploadId); const mapping = this.#requireMapping(mappingId, upload);
    const rows = upload.rows.map((source, index) => {
      const record = {};
      for (const field of TEMPLATE_FIELDS[upload.entity]) {
        let value = Object.hasOwn(mapping.constants, field) ? mapping.constants[field] : source[mapping.fields[field] ?? field];
        if (value !== undefined) value = applyTransform(value, mapping.transforms[field]);
        if (typeof value === 'string') value = neutralizeFormula(cell(value));
        if (value !== undefined) record[field] = value;
      }
      const errors = [];
      const sensitive = Object.values(source).map(detectSensitive).find(Boolean); if (sensitive) errors.push(sensitive);
      if (!cell(record.sourceId)) errors.push('SOURCE_ID_REQUIRED');
      for (const field of INTEGER_FIELDS) if (Object.hasOwn(record, field) && !Number.isSafeInteger(typeof record[field] === 'number' ? record[field] : Number(record[field]))) errors.push(`INTEGER_REQUIRED:${field}`);
      for (const field of MONEY_FIELDS) if (Object.hasOwn(record, field) && Number(record[field]) < 0) errors.push(`NONNEGATIVE_MONEY_REQUIRED:${field}`);
      if (['products', 'inventoryReferences'].includes(upload.entity) && !cell(record.name)) errors.push('NAME_REQUIRED');
      return Object.freeze({ row: index + (upload.format === 'csv' ? 2 : 1), stableSourceId: cell(record.sourceId), record: Object.freeze(record), errors: Object.freeze([...new Set(errors)].sort()) });
    });
    const result = { uploadId, mappingId, entity: upload.entity, sourceHash: upload.sourceHash, rowCount: rows.length, validCount: rows.filter((row) => !row.errors.length).length, errorCount: rows.filter((row) => row.errors.length).length, rows, controlTotals: Object.freeze({ sourceRows: rows.length, acceptedRows: rows.filter((row) => !row.errors.length).length, rejectedRows: rows.filter((row) => row.errors.length).length }) };
    upload.status = result.errorCount ? 'VALIDATED_WITH_ERRORS' : 'VALIDATED'; upload.validation = result; return result;
  }
  previewForUpload(uploadId, mappingId, limit = 25) { const result = this.validate(uploadId, mappingId); return { ...result, rows: result.rows.slice(0, limit), truncated: result.rows.length > limit }; }
  rowErrors(uploadId, mappingId) { return this.validate(uploadId, mappingId).rows.filter((row) => row.errors.length).map(({ row, stableSourceId, errors }) => ({ row, stableSourceId, errors })); }
  createJobFromUpload({ uploadId, mappingId, mode = 'DRY_RUN', idempotencyKey, synthetic = true, createdAt = new Date().toISOString(), injectFailureAt = null }) {
    if (!idempotencyKey || !['DRY_RUN', 'COMMIT'].includes(mode)) throw new DomainError('VALIDATION_FAILED');
    const upload = this.#requireUpload(uploadId); const mapping = this.#requireMapping(mappingId, upload); const validation = this.validate(uploadId, mappingId);
    const command = stable({ uploadId, mappingId, sourceHash: upload.sourceHash, mode, synthetic }); const existing = this.#keys.get(idempotencyKey);
    if (existing) { if (existing.command !== command) throw new DomainError('IDEMPOTENCY_MISMATCH'); return existing.job; }
    if (mode === 'COMMIT' && !synthetic) throw new DomainError('REAL_DATA_COMMIT_DISABLED');
    const provenanceKey = `${upload.provenance}:${upload.sourceVersion}`; const prior = this.#provenance.get(provenanceKey);
    if (prior && prior !== upload.sourceHash) throw new DomainError('IMPORT_PROVENANCE_HASH_CONFLICT');
    const before = new Map(this.#records); let status;
    try {
      if (validation.errorCount) status = 'VALIDATION_FAILED';
      else if (mode === 'DRY_RUN') status = 'DRY_RUN_COMPLETE';
      else {
        validation.rows.forEach((row, index) => { if (injectFailureAt === index) throw new DomainError('INJECTED_IMPORT_FAILURE'); this.#records.set(`${upload.entity}:${row.stableSourceId}`, Object.freeze({ ...row.record, provenance: upload.provenance, sourceHash: upload.sourceHash, mappingVersion: mapping.version })); });
        status = 'COMMITTED_SYNTHETIC';
      }
    } catch (error) { this.#records = before; throw error; }
    this.#provenance.set(provenanceKey, upload.sourceHash);
    const job = Object.freeze({ id: `import-${String(this.#jobs.length + 1).padStart(4, '0')}`, sequence: this.#jobs.length + 1, entity: upload.entity, format: upload.format, mode, dryRun: mode === 'DRY_RUN', synthetic: Boolean(synthetic), sourceHash: upload.sourceHash, provenance: upload.provenance, sourceVersion: upload.sourceVersion, mappingId, mappingVersion: mapping.version, status, rowCount: validation.rowCount, accepted: validation.validCount, rejected: validation.errorCount, errors: Object.freeze(this.rowErrors(uploadId, mappingId)), controlTotals: validation.controlTotals, createdAt, writeback: false, providerCalls: 0 });
    this.#jobs.push(job); this.#keys.set(idempotencyKey, { command, job }); return job;
  }
  reconciliation(jobId) { const job = this.#jobs.find((item) => item.id === jobId); if (!job) throw new DomainError('NOT_FOUND'); return Object.freeze({ jobId, sourceHash: job.sourceHash, sourceRows: job.rowCount, acceptedRows: job.accepted, rejectedRows: job.rejected, committedRows: job.status === 'COMMITTED_SYNTHETIC' ? job.accepted : 0, balanced: job.rowCount === job.accepted + job.rejected, providerCalls: 0 }); }
  job(jobId) { const job = this.#jobs.find((item) => item.id === jobId); if (!job) throw new DomainError('NOT_FOUND'); return job; }
  records(entity) { return [...this.#records.entries()].filter(([key]) => key.startsWith(`${entity}:`)).map(([, value]) => ({ ...value })); }

  // Compatibility surface used by the first implementation pass.
  preview({ entity, format, content, mapping = {} }) {
    const upload = this.upload({ entity: entity === 'inventory' ? 'inventoryReferences' : entity, format, content, provenance: `legacy-preview-${digest(content).slice(0, 8)}` });
    const detected = this.detect(upload.id).detectedFields; const fields = {}; for (const target of TEMPLATE_FIELDS[upload.entity]) if (detected.includes(mapping[target] ?? target)) fields[target] = mapping[target] ?? target;
    const used = new Set(Object.values(fields)); const map = this.createMapping({ uploadId: upload.id, fields, ignored: detected.filter((field) => !used.has(field)) });
    const result = this.previewForUpload(upload.id, map.id); return { entity, format, sourceHash: result.sourceHash, fields: TEMPLATE_FIELDS[upload.entity], rowCount: result.rowCount, validCount: result.validCount, errorCount: result.errorCount, rows: result.rows.map((row) => ({ row: row.row, record: row.record, errors: row.errors.map((error) => error.replaceAll('_', ' ').toLowerCase()) })), truncated: result.truncated, uploadId: upload.id, mappingId: map.id };
  }
  createJob({ entity, format, content, mapping = {}, dryRun = true, idempotencyKey, createdAt = new Date().toISOString() }) {
    const legacyCommand = stable({ entity, format, content, mapping, dryRun: Boolean(dryRun) }); const prior = this.#keys.get(idempotencyKey);
    if (prior?.legacyCommand) { if (prior.legacyCommand !== legacyCommand) throw new DomainError('IDEMPOTENCY_MISMATCH'); return prior.job; }
    const preview = this.preview({ entity, format, content, mapping });
    const job = this.createJobFromUpload({ uploadId: preview.uploadId, mappingId: preview.mappingId, mode: dryRun ? 'DRY_RUN' : 'COMMIT', idempotencyKey, synthetic: true, createdAt });
    this.#keys.set(idempotencyKey, { legacyCommand, job }); return job;
  }
  history() { return Object.freeze(this.#jobs.map((job) => ({ ...job }))); }
  #requireUpload(id) { const upload = this.#uploads.get(id); if (!upload) throw new DomainError('NOT_FOUND'); return upload; }
  #requireMapping(id, upload) { const mapping = this.#mappings.get(id); if (!mapping || mapping.uploadId !== upload.id) throw new DomainError('IMPORT_MAPPING_INVALID'); return mapping; }
  #publicUpload(upload) { const { content: _content, rows: _rows, validation: _validation, ...value } = upload; return Object.freeze({ ...value }); }
}
