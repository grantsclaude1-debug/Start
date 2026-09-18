import { DomainError } from './errors.js';

const VERIFIER_PATTERN = /^scrypt\$v=1\$N=\d+\$r=\d+\$p=\d+\$keylen=\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/;

export function loadConfig(env = process.env) {
  const verifier = env.PRIVATE_GATE_VERIFIER ?? '';
  const sessionSecret = env.PRIVATE_GATE_SESSION_SECRET ?? '';
  const configVersion = Number(env.PRIVATE_GATE_CONFIG_VERSION ?? '1');
  const gateConfigured = VERIFIER_PATTERN.test(verifier) && sessionSecret.length >= 32 && Number.isSafeInteger(configVersion) && configVersion > 0;
  return Object.freeze({
    application: Object.freeze({ mode: 'PRIVATE_BUILD', productionAuthorized: false }),
    tenant: Object.freeze({ id: 'tenant_launch', activeTenantLimit: 1 }),
    venue: Object.freeze({ id: 'venue_launch', activeVenueLimit: 1, timezone: env.VENUE_TIMEZONE ?? 'America/New_York' }),
    commerce: Object.freeze({ currency: (env.VENUE_CURRENCY ?? 'USD').toUpperCase(), stripeConnectEnabled: false }),
    gate: Object.freeze({ verifier, sessionSecret, configVersion, configured: gateConfigured }),
    integrations: Object.freeze({ stripe: false, yellowDog: false, splashRadio: false, rollerWriteback: false })
  });
}

export function requireConfiguredGate(config) {
  if (!config?.gate?.configured) throw new DomainError('PRIVATE_GATE_CONFIGURATION_REQUIRED', 'Private build unavailable');
  return config.gate;
}
