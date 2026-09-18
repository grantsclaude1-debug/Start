import { assert } from '../errors.js';

export function createSingleVenueModel({ tenantId, venueId, timezone, currency = 'USD', merchantId }) {
  assert(tenantId && venueId && merchantId, 'VALIDATION_FAILED', 'Tenant, venue, and merchant IDs are required');
  assert(typeof timezone === 'string' && timezone.includes('/'), 'VALIDATION_FAILED', 'An IANA timezone is required');
  assert(/^[A-Z]{3}$/.test(currency), 'VALIDATION_FAILED', 'ISO currency is required');
  return Object.freeze({
    tenant: Object.freeze({ id: tenantId, status: 'ACTIVE' }),
    venue: Object.freeze({ id: venueId, tenantId, timezone, status: 'ACTIVE' }),
    merchant: Object.freeze({ id: merchantId, tenantId, venueId, currency, stripeConnectEnabled: false }),
    activeTenantCount: 1,
    activeVenueCount: 1
  });
}
