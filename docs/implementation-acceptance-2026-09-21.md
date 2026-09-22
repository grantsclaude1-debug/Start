# Implementation acceptance — 2026-09-21

These owner-provided requirements are binding for the current rebuild.

## Product direction

- Build the authenticated product as a dense production console, not marketing cards.
- Use evergreen, off-white, and lime design tokens; reserve lime for selection and high emphasis.
- Desktop: 264 px collapsible rail with Today, Sell, Admissions, Bookings, Catalog, Reports, and Operations. Operations contains Reconciliation, Integrations, and Settings.
- Mobile: fixed bottom navigation for Today, Sell, Scan, and More. Do not use a workspace selector as primary mobile navigation.
- Top bar: local date/time, freshness, system health, account, and one contextual primary action.
- Today: linked KPIs, session-capacity table, attention queue, arrivals trend, and recent activity.
- Sell: guided checkout with main selection, sticky summary, and progressive steps.
- Admissions: dominant scanner/manual-lookup lane with explicit accepted, duplicate, denied, and manager-review states.
- Bookings: run sheet, list/calendar modes, and detail drawer.
- Reports: catalog, selected report workspace, and export-job lifecycle states. Do not initiate downloads during this task.
- Operations: readiness checklist plus exception/sync queue.
- Use semantic status badges, production data tables, filter bars, form primitives, metrics, drawers/dialogs, inline feedback, and timelines.
- Treat loading, empty, error, stale, and access-denied states as first-class.
- Responsive breakpoints: 1200 px and 768 px. On mobile, reorder by urgency, use full-height sheets, use an accessible table strategy, and prevent page overflow.
- Meet WCAG 2.2 AA intent with strong focus visibility, keyboard workflows, reduced-motion handling, and forced-colors support.
- Use exact operational language: queued versus sent; stored for authorization versus paid; accepted, denied, and manager review.

## Quality and security acceptance

Preserve the existing `npm run verify` baseline and add focused coverage for:

- capacity never becoming negative;
- idempotency;
- integer-only money;
- hold/order/ticket/outbox atomicity under injected failures;
- authenticated and anonymous access matrix;
- malformed and oversized requests and import abuse;
- import dry-run, idempotency, atomicity, reconciliation, and deterministic history;
- CSV formula neutralization;
- concurrent final-capacity holds;
- hold expiry versus consume races;
- duplicate check-ins;
- report/export lifecycle states without downloading;
- connector retry, mapping, and rate-failure states without provider calls;
- secret scanning and security headers.

## Rendered verification

- Exercise every route and meaningful state at widths 320, 375, 768, 1024, and 1440 px. Wider 1366/1920 checks are encouraged where time permits.
- Verify keyboard order, focus movement, error/loading/empty/stale/access-denied states, double-submit prevention, mobile feature parity, console errors, and request behavior.
- Confirm there are no provider calls and no downloads.
- Keep evidence exact and reproducible; do not infer coverage from static source alone.

## Production-readiness honesty

The current Vercel-compatible implementation uses in-memory process-local state. It is not production-durable across restarts or multiple instances. UI and documentation must state this clearly and must not label the system production-ready until durable shared storage, transactional coordination, and appropriate production authentication/operations are implemented and proven.

## Product architecture priorities

### P0

- Operations Home.
- Orders/Bookings list and detail.
- Sell.
- Admissions.
- Schedule/Capacity calendar and session detail.
- Reports result workspace.
- Exceptions/Recovery.

### P1

- Catalog/Pricing.
- Refunds/Cancellations.
- Readiness/Integrations.
- Audit.

### P2, if time remains

- Finance.
- Offline simulator.
- Gift cards.
- Memberships.

### Information architecture

- Today.
- Sales: Sell, Orders.
- Operations: Schedule, Admissions, Exceptions.
- Insights: Reports, Finance.
- System: Readiness, Offline, Audit.
- Catalog under venue setup.

### API and domain requirements

- Prefer resource APIs/read models over one monolithic `/api/state` response.
- Provide resources for products, sessions, capacity blocks, holds, orders, tickets, check-ins, exceptions, reports, and export jobs.
- Model capacity blocks as explicit records.
- Add a controlled local clock and deterministic jobs for hold expiry, report/export progression, and connector retries.
- Implement a fake `PaymentProvider` with deterministic scenarios and exact language distinguishing stored for authorization from paid.
- Use a real local `TicketTokenService` in admissions rather than matching arbitrary display codes.
- Build an append-only domain event/audit projection and `ExceptionCase` model.
- Implement safe local Yellow Dog and migration simulators with pagination, HTTP-429-style throttling, token expiry, mapping failures, partial batches, and acknowledgements. These must never call providers.
- Clearly label the offline simulator as local/synthetic.
- Keep durable database storage, RBAC/production authentication, and all real provider integrations explicitly blocked while providing useful deterministic local substance now.

## Import Center contract

Implement a useful local/synthetic Import Center while clearly disabling any real-data commit under the temporary shared-passcode gate.

### Entity templates

- Products.
- Sessions.
- Orders.
- Tickets.
- Customers, synthetic-only and without real PII.
- Memberships.
- Gift cards.
- Inventory references.
- Waivers.
- Check-ins.

### Operator flow

1. Select an entity template.
2. Supply CSV, NDJSON, or JSON content through a bounded local browser file flow.
3. Detect format/schema.
4. Map fields, constants, and allow-listed transforms; unknown fields require explicit `IGNORE`.
5. Validate.
6. Preview canonical rows.
7. Run a zero-mutation dry run.
8. Permit commit only for clearly synthetic fixture data.
9. Show job history, row-level errors, control totals, and reconciliation.

### Suggested dependency-free APIs

- `GET /api/import/templates`
- `POST /api/import/uploads` using a bounded JSON payload rather than multipart for this local prototype
- `POST /api/import/uploads/:id/detect`
- `POST /api/import/mappings`
- `POST /api/import/uploads/:id/validate`
- Preview and row-error reads for an upload
- `POST /api/import/jobs` with `DRY_RUN` or `COMMIT`
- `GET /api/import/jobs/:id`
- Reconciliation read for a job

### Required controls

- Track file hash, mapping version, idempotency key, provenance, stable source IDs, deterministic error codes, and control totals.
- Neutralize CSV formula prefixes `=`, `+`, `-`, and `@` in any rendered/export-like representation.
- Reject secrets, payment-card numbers/PAN, access tokens, and real PII patterns.
- Dry runs must cause zero mutation.
- The same provenance plus hash must be idempotent; reusing a provenance/version with a different hash must block.
- Keep the ROLLER connector read-only and disabled, with no write endpoint and no generic-request proxy.

## Integration kernel contract

Build a common local-only integration kernel.

### Core records

- `Connection`: kind, mode (`DISABLED`, `FIXTURE`, `DRY_RUN`, `MANUAL`, `LIVE`), status, capabilities, mapping version, checkpoint, health, and queue metrics.
- Immutable `Command`, `Attempt`, `Acknowledgement`, `Exception`, and `Reconciliation` records.
- Command lifecycle: `DRAFT` → `VALIDATED` → `DRY_RUN_QUEUED` → `RENDERED` or `REJECTED`.
- Model a future live queue but keep it disabled and unreachable.

### Allowed modes

- Credential-free builds may use only `FIXTURE` and `DRY_RUN`.
- Splash Radio may additionally use `MANUAL`.
- `LIVE` must be unreachable.
- Unsupported capabilities must fail before any I/O.
- Credentials must appear only as missing secret-reference/status metadata; never as values.

### Integration UI

Provide integration cards and details with tabs for Overview, Configuration, Capabilities, Mappings, Queue, Health, Reconciliation, and Audit.

### Required simulations

- Stripe: payment, refund, dispute, and payout lifecycle fixtures with no provider calls or raw-card handling.
- Yellow Dog: read-only fixture mirror; deterministic two-requests-per-second throttling, retry, and checkpoint simulation; dry-run finalized-sale queue only.
- ROLLER: read-only migration rehearsal with provenance, hash, exceptions, and reconciliation; no source mutation, download, or generic request path.
- Splash Radio: manual task and acknowledgement only.
- Offline outbox: duplicate, gap, conflict, and expiry scenarios.
- Reports: plain-language definitions/freshness plus asynchronous export-job states without initiating downloads.
- Disabled placeholders: Resend, KDS, Campaign Monitor, Groupon, Xero, and generic webhooks.

End-to-end tests must prove zero external requests.
