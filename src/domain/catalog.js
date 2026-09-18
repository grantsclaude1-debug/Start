import { assert } from '../errors.js';

export const PRODUCT_TYPES = Object.freeze(['TIMED_ADMISSION', 'GENERAL_ADMISSION', 'GROUP_PACKAGE', 'BUNDLE', 'STOCK_ITEM']);

export function createProduct(input) {
  assert(input?.id && input.tenantId && input.venueId && input.name, 'VALIDATION_FAILED');
  assert(PRODUCT_TYPES.includes(input.type), 'VALIDATION_FAILED', 'Unsupported product type');
  assert(Number.isSafeInteger(input.priceMinor) && input.priceMinor >= 0, 'VALIDATION_FAILED', 'Price must be integer minor units');
  assert(/^[A-Z]{3}$/.test(input.currency), 'VALIDATION_FAILED', 'ISO currency required');
  return Object.freeze({ ...input, status: input.status ?? 'ACTIVE', version: 1 });
}

export function createSession(input) {
  const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
  assert(input?.id && input.productId && input.tenantId && input.venueId && input.capacityPoolId, 'VALIDATION_FAILED');
  assert(Number.isFinite(startsAt.valueOf()) && Number.isFinite(endsAt.valueOf()) && startsAt < endsAt, 'VALIDATION_FAILED', 'Valid session interval required');
  return Object.freeze({ ...input, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), status: input.status ?? 'SELLABLE', version: 1 });
}
