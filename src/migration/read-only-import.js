import { createHash } from 'node:crypto';
import { DomainError, assert } from '../errors.js';

export class ReadOnlyMigrationSource {
  async listDataClasses() { throw new DomainError('NOT_IMPLEMENTED'); }
  async *readRows() { throw new DomainError('NOT_IMPLEMENTED'); }
}

export class MigrationImporter {
  constructor() { this.records = new Map(); this.exceptions = []; }
  importRow({ sourceSystem, sourceClass, sourceKey, batchId, row, transformVersion = 1 }) {
    assert(sourceSystem && sourceClass && sourceKey && batchId && row && typeof row === 'object', 'VALIDATION_FAILED');
    const provenanceKey = `${sourceSystem}:${sourceClass}:${sourceKey}:${batchId}`; const sourceHash = createHash('sha256').update(JSON.stringify(row)).digest('hex'); const previous = this.records.get(provenanceKey);
    if (previous) { if (previous.sourceHash !== sourceHash) throw new DomainError('MIGRATION_SOURCE_CHANGED'); return previous; }
    const record = Object.freeze({ sourceSystem, sourceClass, sourceKey, batchId, sourceHash, transformVersion, result: 'IMPORTED', reversalStatus: 'NONE' }); this.records.set(provenanceKey, record); return record;
  }
  writeBackToSource() { throw new DomainError('MIGRATION_SOURCE_READ_ONLY', 'Source writeback is prohibited'); }
}
