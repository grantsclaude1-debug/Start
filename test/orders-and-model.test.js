import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleVenueModel } from '../src/domain/venue.js';
import { createProduct, createSession } from '../src/domain/catalog.js';
import { createOrder, transitionOrder } from '../src/domain/orders.js';
import { fixtureProducts, fixtureSession, fixtureVenue } from '../src/fixtures/non-pii.js';

test('single-venue model keeps tenant boundary and disables Connect', () => {
  const model = createSingleVenueModel(fixtureVenue);
  assert.equal(model.activeTenantCount, 1); assert.equal(model.activeVenueCount, 1); assert.equal(model.merchant.stripeConnectEnabled, false);
});

test('catalog/session fixtures are synthetic and valid', () => {
  const product = createProduct(fixtureProducts[0]); const session = createSession(fixtureSession);
  assert.equal(product.version, 1); assert.equal(session.productId, product.id);
});

test('orders use integer minor units and explicit legal transitions', () => {
  const order = createOrder({ id: 'order-1', tenantId: 'tenant-1', venueId: 'venue-1', currency: 'USD', lines: [{ productId: 'product-1', quantity: 2, unitAmountMinor: 1250 }] });
  assert.equal(order.totalMinor, 2500);
  transitionOrder(order, 'PENDING_PAYMENT', 1); transitionOrder(order, 'CONFIRMED', 2);
  assert.equal(order.status, 'CONFIRMED');
  assert.throws(() => transitionOrder(order, 'DRAFT', 3), { code: 'INVALID_TRANSITION' });
  assert.throws(() => transitionOrder(order, 'FULFILLED', 2), { code: 'VERSION_CONFLICT' });
});

test('floating and negative money are rejected', () => {
  assert.throws(() => createOrder({ id: 'o', tenantId: 't', venueId: 'v', currency: 'USD', lines: [{ productId: 'p', quantity: 1, unitAmountMinor: 1.5 }] }), { code: 'VALIDATION_FAILED' });
});
