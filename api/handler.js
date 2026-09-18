import { createDemoRequestHandler } from '../src/server.js';

// A warm Vercel function instance may reuse this state, but another instance or
// cold start receives a separate empty state. This is intentionally a synthetic
// preview boundary, never a durable sales, capacity, ticket, or check-in store.
const handler = createDemoRequestHandler({
  env: process.env,
  secureCookie: true,
  trustProxy: true,
});

export default handler;
