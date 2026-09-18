# Synthetic venue operations demo

A dependency-free Node.js 24 local HTTP application for demonstrating venue products, timed-session capacity, atomic holds, sample orders, synthetic tickets, admissions, reports, offline/outbox concepts, and inert integration seams.

> **NON-PRODUCTION / SYNTHETIC DATA ONLY.** This application is not approved or suitable for production. It stores everything in memory, accepts no real PII or credentials beyond the local gate secrets, collects no payment, performs no live provider action, and loses all state when the process stops.

## Safe local setup and launch

Requirements: Node.js 24 and npm. Do not create a `.env` file and do not put a plaintext passcode in source, command arguments, shell history, fixtures, or logs.

The following zsh commands prompt without echoing the passcode, convert it to a salted scrypt verifier, remove the plaintext setup value, generate an independent session secret, and bind the server to loopback only:

```sh
read -rs "PRIVATE_GATE_SETUP_PASSCODE?Choose a high-entropy passcode (16+ characters): "; echo
export PRIVATE_GATE_SETUP_PASSCODE
export PRIVATE_GATE_VERIFIER="$(npm run --silent gate:setup)"
unset PRIVATE_GATE_SETUP_PASSCODE
export PRIVATE_GATE_SESSION_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
export HOST=127.0.0.1 PORT=3000
npm start
```

Open `http://127.0.0.1:3000`, enter the same passcode, and stop with **Ctrl-C**. Then clear server secrets from that shell:

```sh
unset PRIVATE_GATE_VERIFIER PRIVATE_GATE_SESSION_SECRET
```

Runtime variables:

- `PRIVATE_GATE_VERIFIER` — required encoded `scrypt$v=1$...` verifier; there is no default plaintext passcode.
- `PRIVATE_GATE_SESSION_SECRET` — required independent secret of at least 32 characters.
- `PRIVATE_GATE_CONFIG_VERSION` — optional positive rotation number; defaults to `1`.
- `HOST` — defaults to `127.0.0.1`; keep loopback-only for this demo.
- `PORT` — defaults to `3000`.
- `DEMO_COOKIE_SECURE=1` — adds the `Secure` cookie attribute when the demo is served through local HTTPS. Plain loopback HTTP uses HttpOnly, SameSite=Strict, Path, and Max-Age attributes without `Secure`, because browsers reject Secure cookies over HTTP.

Missing or malformed gate secrets fail closed before the server begins listening. Passcodes are verified server-side. Session tokens are random, stored only as HMAC hashes in memory, idle/absolute-expiring, HttpOnly, SameSite=Strict, and revoked on logout. Authentication failures are generic.

## What is implemented

- Responsive, keyboard-usable semantic vanilla HTML/CSS/JavaScript UI with persistent **NON-PRODUCTION / SYNTHETIC** warnings.
- Clickable product/session dashboard showing total, blocked, held, confirmed, and available capacity.
- Server-side atomic hold validation, idempotency, version checks, expiry rules, and oversell rejection.
- Sample order flow with integer-minor-unit totals and an explicitly disabled payment provider placeholder.
- Synthetic signed ticket issuance, a decorative QR-like display that is **not scanner-compatible**, and server-validated idempotent check-in/duplicate handling.
- Plain-language reports with authenticated CSV and JSON downloads.
- In-memory hash-chained offline/outbox demonstration.
- Yellow Dog read-only synthetic inventory mirror and local sales queue display; no delivery or inventory writes.
- Splash Radio manual-only status; no programmatic action.
- Migration read-only model; source writeback is prohibited.
- Exact static-file allowlist, no directory serving, traversal rejection, response security headers, 16 KiB JSON body limit, JSON content-type enforcement, origin/Sec-Fetch checks, and per-session CSRF tokens for mutations.

## Architecture

- `src/server.js` — Node stdlib HTTP routes, security boundary, synthetic application state, and API orchestration.
- `src/start.js` — fail-closed loopback server entry point and graceful signal shutdown.
- `public/` — accessible semantic UI; it never contains secrets or authoritative mutation logic.
- `src/auth/` — salted scrypt verifier, in-memory attempt limiter, HMAC-indexed session store, expiry, and revocation.
- `src/domain/` — products/sessions, capacity and holds, orders, signed tickets, and admissions.
- `src/reporting/` — stable plain-language report definitions and deterministic CSV/JSON artifacts.
- `src/offline/` — idempotency and append-only hash-chained outbox primitives.
- `src/integrations/` — Yellow Dog read-only mirror/disabled-by-default queue seam and manual-only Splash Radio seam.
- `src/migration/` — provenance-aware read-only import model with no source writeback.

All state, ticket signing keys, sessions, orders, holds, tickets, check-ins, report inputs, mirrors, and queues are synthetic and process-local.

## Verification

```sh
npm run verify
```

This runs syntax/import/dependency/static checks, the dependency-free documentation validator, and all `node:test` tests. Individual commands are:

```sh
npm run check
npm run docs:check
npm test
```

## Safety and production limitations

This is intentionally a local demonstration—not a deployable system. It has no database, durable transaction/locking boundary, shared session or rate-limit store, TLS terminator, user identities/roles/MFA, audit-log persistence, backup/recovery, privacy program, real device trust, encrypted offline store, monitoring, production key management, or deployment configuration. A single Node process makes synchronous mutations deterministic for the demo; it is not evidence of multi-process atomicity.

Payments and all provider operations are disabled placeholders. Yellow Dog is a read-only mirror plus an in-memory sales queue display, not a write integration. Splash Radio is manual-only. Migration is read-only. Report downloads contain synthetic rows only. The ticket pattern is decorative and deliberately not scanner-compatible. No software-only claim is made for outage operation or total power loss.
