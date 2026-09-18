export const fixtureVenue = Object.freeze({ tenantId: 'tenant_demo', venueId: 'venue_demo', timezone: 'America/New_York', currency: 'USD', merchantId: 'merchant_demo' });
export const fixtureProducts = Object.freeze([
  Object.freeze({ id: 'product_timed_demo', tenantId: 'tenant_demo', venueId: 'venue_demo', name: 'Timed Admission Demo', type: 'TIMED_ADMISSION', priceMinor: 2500, currency: 'USD' }),
  Object.freeze({ id: 'product_general_demo', tenantId: 'tenant_demo', venueId: 'venue_demo', name: 'General Admission Demo', type: 'GENERAL_ADMISSION', priceMinor: 1800, currency: 'USD' })
]);
export const fixtureSession = Object.freeze({ id: 'session_demo', tenantId: 'tenant_demo', venueId: 'venue_demo', productId: 'product_timed_demo', capacityPoolId: 'pool_demo', startsAt: '2030-06-01T14:00:00.000Z', endsAt: '2030-06-01T15:00:00.000Z' });
