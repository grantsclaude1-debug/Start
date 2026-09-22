# Second implementation pass evidence — 2026-09-21

This evidence covers the binding requirements in [Implementation acceptance — 2026-09-21](implementation-acceptance-2026-09-21.md).

## Baseline and scope

- Starting commit: `983d2668553ef1841e997f0480923cea6c6cc35f`.
- Starting tree: clean; branch `main` was one local commit ahead of `origin/main`.
- Work stayed inside this repository. No push, deployment, provider call, external message, or download was performed.
- The implementation remains dependency-free and uses only Node.js built-ins.

## Implemented product surface

- Dense evergreen/off-white/lime console with a 264 px collapsible rail, mobile Today/Sell/Scan/More navigation, contextual top action, service time, freshness, health, and account boundary.
- Today, Sell, Admissions, Bookings, Orders, Catalog, Schedule/Capacity, Operations Home, Exceptions/Recovery, Reports, Reconciliation, Integrations, Readiness, Offline Simulator, Audit, Import Center, and the retained synthetic supporting surfaces.
- Production tables, filters, forms, badges, timelines, sticky checkout summary, booking detail drawer, integration tabs, loading/empty/error/disabled states, explicit production blockers, mobile table transformation, full-height mobile drawer behavior, reduced motion, forced colors, and visible focus.
- Exact wording for `Queued`, `Stored for authorization — not paid`, `Paid`, `Accepted`, `Denied`, and `Manager review`.

## Domain and API controls

- Resource reads for products, sessions, capacity blocks, holds, orders, tickets, check-ins, exceptions, reports, export jobs, audit, connectors, and integration detail.
- Controlled clock and deterministic job runner for expiry/progression/retry work.
- Deterministic fake payment provider with stored, authorized, paid, and denied fixtures; no raw-card handling and zero provider calls.
- Real local Ed25519 ticket tokens and server-side admission registry. Manual lookup posts a signed token to `/api/tickets/lookup`; arbitrary display codes are rejected and are never treated as validation input.
- Hash-linked append-only domain event projection and immutable exception cases.
- Atomic checkout service rolls back hold, order, ticket, admission, outbox, and audit state at every injected boundary.
- Export lifecycle `QUEUED → RUNNING → RENDERED | FAILED → EXPIRED`, always non-downloadable in the UI lifecycle.

## Import Center

- Templates: products, sessions, orders, tickets, customers, memberships, gift cards, inventory references, waivers, and check-ins.
- CSV, JSON, and NDJSON parsing; bounded bytes/rows; format detection; explicit mapping, constants, allow-listed transforms, and required `IGNORE` for unknown source fields.
- Stable source IDs, SHA-256 content hashes, mapping versions, provenance/version collision blocking, deterministic error codes, row errors, control totals, reconciliation, and deterministic history.
- Formula-prefix neutralization for `=`, `+`, `-`, and `@` in previews and report CSV.
- Rejection of detected secrets, access tokens, payment-card numbers that pass Luhn validation, email addresses, and telephone patterns.
- Dry run has zero mutation. Commit is reachable only for explicitly synthetic fixture data and rolls back fully under injected failure.
- ROLLER remains read-only with no writeback or generic-request proxy.

## Integration kernel

- Connection metadata includes kind, mode, status, capabilities, mapping version, checkpoint, health, queue metrics, and missing secret-reference status without secret values.
- Immutable command, attempt, acknowledgement, exception, and reconciliation records.
- Command lifecycle is `DRAFT → VALIDATED → DRY_RUN_QUEUED → RENDERED` or `REJECTED`; `LIVE` is unreachable and unsupported capabilities fail before I/O.
- Local scenarios cover Stripe lifecycle fixtures, Yellow Dog throttling/retry/checkpoint/mapping/token/partial states, ROLLER rehearsal, Splash Radio manual acknowledgement, offline duplicate/gap/conflict/expiry, reports, and disabled placeholders for Resend, KDS, Campaign Monitor, Groupon, Xero, and generic webhooks.
- Every record and UI card reports zero provider calls.

## Automated verification

`npm run verify` passes after implementation: 48 JavaScript files parsed, documentation and Vercel checks passed, and 80/80 tests passed. The suite covers:

- capacity floor, final-unit contention, and expiry/consume races;
- idempotency mismatch behavior;
- integer-only money, paid-fixture refunds, refund idempotency, and injected refund atomicity;
- injected checkout atomicity;
- product, session, and capacity-block mutations with expected-version conflicts, idempotency, and capacity protection;
- gate authentication and anonymous/authenticated API boundaries;
- malformed JSON, wrong content type, oversized body, import abuse, provenance collision, dry-run zero mutation, atomic commit, reconciliation, and deterministic history;
- formula neutralization;
- signed-token manual lookup success, arbitrary display-code rejection, and duplicate check-ins;
- export lifecycle without download;
- connector retry/mapping/token/rate/partial/gap/conflict states without provider calls;
- secret scanning and response security headers;
- Vercel adapter fail-closed behavior.

## Rendered verification

The exact machine-readable result is [rendered-verification-2026-09-21.json](rendered-verification-2026-09-21.json).

- Installed Google Chrome rendered all 23 authenticated views at 320, 375, 768, 1024, 1440, and 1920 px: 138 route/viewport checks.
- Every check confirmed the route was visible, heading focus moved correctly, and document width did not overflow the viewport.
- Exercised failed/successful authentication and logout; native invalid-quantity feedback; double-submit prevention; paid local checkout; booking calendar/search/detail; order filter/detail; accepted and duplicate admissions; report definitions/freshness/filter and `QUEUED → RUNNING → RENDERED → EXPIRED` export progression; all eight integration tabs, keyboard tab movement, connector retry/history/reconciliation; operations states; and finance/refund failure, success, and idempotency.
- Exercised all ten Import Center templates in the rendered selector; CSV, JSON, and NDJSON detection; explicit `IGNORE`, transforms, canonical preview, row errors, dry run, synthetic commit, reconciliation, deterministic history, idempotency, formula neutralization, PII rejection, and provenance/hash collision handling.
- Exercised product, session, and capacity-block mutation success, duplicate idempotency, stale-version conflicts, and capacity over-block rejection.
- Rendered and verified explicit loading, empty, error, stale, and access-denied states after the final layout change.
- The independent parent audit found and corrected the remaining browser-only display-code lookup: the rendered admissions field now accepts signed tokens only, and focused API/UI regressions prove server-side verification and display-code rejection. The corrected Admissions route was then rendered again at 320, 375, 768, 1024, 1440, and 1920 px with visible/focused controls, no horizontal overflow, explicit arbitrary-code denial, zero runtime exceptions, zero external requests, and zero downloads.
- Final JavaScript/runtime console errors: 0. Seven expected browser network-log entries corresponded exactly to the deliberately exercised 400/409 failure paths. External/provider requests: 0. Downloads: 0. Observed requests: 62, all loopback same-origin or inline `data:` UI resources.

## Remaining production blockers

This is not production-ready. All state, authentication sessions, signing keys, queues, events, imports, orders, tickets, and check-ins are process-local and ephemeral. Durable shared storage, transactional multi-instance coordination, production authentication/RBAC/MFA, secret management, monitoring, backup/recovery, real provider certification, privacy controls, and deployment proof remain blocked.
