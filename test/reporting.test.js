import test from 'node:test';
import assert from 'node:assert/strict';
import { exportReport, REPORT_DEFINITIONS } from '../src/reporting/reports.js';

const row = { service_date: '2030-06-01', product_id: 'product,"demo"', session_id: 'session-1', channel: 'ONLINE', tickets_sold: 2, gross_minor: 5000, refunded_minor: 0, net_minor: 5000, currency: 'USD' };

test('report definitions are plain-language and stable', () => {
  assert.match(REPORT_DEFINITIONS.ticket_sales.purpose, /ticket quantity and sales/i);
  assert.deepEqual(REPORT_DEFINITIONS.ticket_sales.columns.slice(-2), ['net_minor', 'currency']);
});

test('CSV export has stable headers, correct escaping, and hash', () => {
  const artifact = exportReport({ reportId: 'ticket_sales', rows: [row], format: 'csv', generatedAt: '2030-06-01T16:00:00.000Z' });
  const body = artifact.bytes.toString('utf8');
  assert.equal(body.split('\n')[0], REPORT_DEFINITIONS.ticket_sales.columns.join(','));
  assert.match(body, /"product,""demo"""/); assert.equal(artifact.sha256.length, 64); assert.equal(artifact.rowCount, 1);
});

test('JSON export carries definitions, freshness, filters, and rows', () => {
  const artifact = exportReport({ reportId: 'ticket_sales', rows: [row], format: 'json', generatedAt: '2030-06-01T16:00:00.000Z', filters: { serviceDate: '2030-06-01' } });
  const parsed = JSON.parse(artifact.bytes);
  assert.equal(parsed.generatedAt, '2030-06-01T16:00:00.000Z'); assert.equal(parsed.rowCount, 1); assert.equal(parsed.filters.serviceDate, '2030-06-01');
});

test('report rows missing defined fields are rejected', () => {
  assert.throws(() => exportReport({ reportId: 'ticket_sales', rows: [{}], format: 'csv' }), { code: 'REPORT_SCHEMA_MISMATCH' });
});
