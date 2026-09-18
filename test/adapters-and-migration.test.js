import test from 'node:test';
import assert from 'node:assert/strict';
import { DisabledStripeAdapter } from '../src/payments/stripe-placeholder.js';
import { YellowDogAdapter } from '../src/integrations/yellow-dog.js';
import { ManualVenueAudioAdapter } from '../src/integrations/splash-radio.js';
import { MigrationImporter } from '../src/migration/read-only-import.js';

test('Stripe placeholder exposes no live calls, Terminal, or Connect', async () => {
  const stripe = new DisabledStripeAdapter(); assert.deepEqual(stripe.capabilities(), { provider: 'stripe', liveCalls: false, connect: false, terminal: false, webhooks: false });
  await assert.rejects(stripe.createOrReusePaymentAttempt({}), { code: 'PAYMENT_PROVIDER_DISABLED' });
});

test('Yellow Dog write capabilities are disabled by default', async () => {
  const adapter = new YellowDogAdapter(); const capabilities = adapter.capabilities();
  assert.equal(capabilities.salesWrite, false); assert.equal(capabilities.itemWrite, false); assert.equal(capabilities.countWrite, false); assert.equal(capabilities.webhooks, false);
  await assert.rejects(adapter.pushSales([]), { code: 'INVENTORY_WRITE_DISABLED' });
});

test('Splash Radio is manual-only, honest, and blocked from programmatic enablement', () => {
  const adapter = new ManualVenueAudioAdapter();
  assert.equal(adapter.discoverCapabilities().vendorIdentity, 'ambiguous');
  const result = adapter.execute({ commandId: 'audio-1', idempotencyKey: 'key-1', expiresAt: '2999-01-01T00:00:00Z' });
  assert.equal(result.status, 'manual-required'); assert.equal(result.vendorReference, null);
  assert.throws(() => adapter.enableProgrammaticMode(), { code: 'AUDIO_PROVIDER_UNCONFIRMED' });
});

test('migration import is idempotent, records provenance, and cannot write back', () => {
  const importer = new MigrationImporter(); const command = { sourceSystem: 'roller-read-only', sourceClass: 'product', sourceKey: 'source-1', batchId: 'batch-1', row: { label: 'Synthetic product' } };
  const first = importer.importRow(command); const second = importer.importRow(command);
  assert.deepEqual(first, second); assert.equal(first.sourceHash.length, 64); assert.equal(first.result, 'IMPORTED');
  assert.throws(() => importer.writeBackToSource(), { code: 'MIGRATION_SOURCE_READ_ONLY' });
  assert.throws(() => importer.importRow({ ...command, row: { label: 'Changed' } }), { code: 'MIGRATION_SOURCE_CHANGED' });
});
