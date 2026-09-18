# Events, Webhooks, API, and Security Boundaries

[Back to index](README.md) · [Invariants](invariants.md) · [Testing](delivery-plan.md#test-strategy)

## Event catalog

Event envelope: `event_id`, `event_name`, `event_version`, `tenant_id`, optional `venue_id`, `aggregate_type`, `aggregate_id`, `aggregate_version`, `occurred_at`, `correlation_id`, `causation_id`, and minimized `data`. Events are immutable; schema compatibility is tested.

| Domain | Canonical events |
|---|---|
| Capacity | `capacity.hold.created.v1`, `capacity.hold.consumed.v1`, `capacity.hold.released.v1`, `capacity.hold.expired.v1`, `capacity.block.changed.v1` |
| Orders | `order.submitted.v1`, `order.confirmed.v1`, `order.canceled.v1`, `order.fulfilled.v1`, `order.refunded.v1` |
| Admissions | `ticket.issued.v1`, `ticket.voided.v1`, `checkin.recorded.v1` |
| Payments | `payment.attempt.updated.v1`, `payment.captured.v1`, `refund.succeeded.v1`, `refund.failed.v1`, `dispute.opened.v1`, `dispute.closed.v1` |
| Stored value | `gift_card.issued.v1`, `stored_value.authorized.v1`, `stored_value.captured.v1`, `stored_value.released.v1`, `gift_card.status_changed.v1` |
| Memberships | `membership.activated.v1`, `membership.billing_failed.v1`, `membership.suspended.v1`, `membership.reactivated.v1`, `membership.terminated.v1` |
| Finance | `journal.posted.v1`, `payout.updated.v1`, `reconciliation.exception_opened.v1`, `reconciliation.exception_closed.v1` |
| Security | `private_gate.session_created.v1`, `private_gate.session_revoked.v1`, `private_gate.rate_limited.v1`; future `role.binding_changed.v1`, `audit.high_risk_action.v1` |
| Offline operations | `offline.manifest.issued.v1`, `offline.command.received.v1`, `offline.command.resolved.v1`, `offline.sync_completed.v1` |
| Reporting | `report.export_requested.v1`, `report.export_ready.v1`, `report.export_expired.v1` |
| Inventory/Yellow Dog | `inventory.location.upserted.v1`, `inventory.item.upserted.v1`, `inventory.item.deactivated.v1`, `inventory.vendor.upserted.v1`, `inventory.recipe.upserted.v1`, `inventory.purchase_order.upserted.v1`, `inventory.receipt.upserted.v1`, `inventory.transfer.upserted.v1`, `inventory.count_sheet.upserted.v1`, `inventory.on_hand.observed.v1`, `yellowdog.sale.submission.requested.v1`, `yellowdog.sale.submission.accepted.v1`, `yellowdog.sale.submission.rejected.v1`, `yellowdog.sale.submission.reconciled.v1`, `inventory.mapping_failed.v1` |
| Venue audio | `audio.connection.health_changed.v1`, `audio.player.status_changed.v1`, `audio.schedule.sync_requested.v1`, `audio.schedule.synced.v1`, `audio.schedule.sync_failed.v1`, `audio.command.requested.v1`, `audio.command.succeeded.v1`, `audio.command.failed.v1`, `audio.licensing.status_changed.v1` |

Transactional outbox creation occurs with aggregate mutation. Publishers deliver at least once; consumers deduplicate by `event_id` and apply only valid aggregate versions. Payloads exclude secrets, raw payment data, scan tokens, signatures, and unnecessary PII.

## Provider webhook ingress

1. Accept only TLS and bounded request sizes at provider-specific endpoints.
2. Preserve the exact raw body; select account context without trusting payload-controlled Tenant IDs.
3. Verify signature, timestamp tolerance, endpoint secret version, and provider account.
4. Insert WebhookInbox under unique `(provider, account_context, external_event_id)` and encrypted payload reference/hash.
5. Return 2xx after durable enqueue; invalid authentication returns 4xx and is alerted.
6. Process asynchronously; retrieve current provider object when snapshots are stale/incomplete.
7. Apply canonical transition under lock, create Journal/outbox atomically, and mark outcome.
8. Retry transient failures with exponential backoff and jitter; cap attempts, dead-letter, alert, and support audited replay.

Delivery attempts are unordered and duplicated by design. Business logic never relies on webhook arrival order. Retry periods and payload retention are configuration approved under `OQ-011`.

## Public webhook delivery

Subscriptions specify Tenant/Venue scope, allow-listed event names, HTTPS endpoint, secret version, and status. Deliver a signed canonical body containing event ID/time/version. Record each attempt, response class, duration, and next attempt; never retain response bodies containing secrets. Retries use exponential backoff/jitter and stop after the documented window; `2xx` succeeds, redirects are rejected, `410` disables after policy, and other failures retry. Receivers deduplicate `event_id`; replay creates a new delivery, not a new event. Secret rotation supports overlap and audited revocation.

## API surface

Base path `/api/v1`; JSON over HTTPS. Resource endpoints:

- `/tenants`, `/venues`, `/users`, `/roles`, `/role-bindings`
- `/products`, `/sessions`, `/capacity-blocks`, `/reservation-holds`
- `/orders`, `/orders/{id}/confirm`, `/orders/{id}/cancel`
- `/tickets`, `/tickets/{id}/check-ins`
- `/payments`, `/payment-attempts`, `/refunds`, `/disputes`
- `/gift-cards`, `/gift-cards/{id}/entries`
- `/membership-contracts`
- `/journals` (read), `/reconciliation-exceptions`
- `/reports`, `/report-exports`, `/report-exports/{id}/download`
- `/devices`, `/offline-manifests`, `/offline-commands:sync`
- `/integration-connections`, `/integration-mappings`, `/inventory-exceptions`
- `/private-gate/session` (initial private build only)
- `/webhook-subscriptions`, `/events` (authorized replay/query)

Commands use explicit action endpoints when they are not CRUD. Responses include resource `id`, `version`, and timestamps. Never expose provider secrets or raw payloads.

### API contract

- **Temporary private-build access:** One shared passcode gate configured only as a versioned salted verifier/secret reference; no hard-coded/default/plaintext passcode. Attempts are rate-limited and sessions are short-lived secure cookies. The gate grants only `PRIVATE_BUILD_ACCESS`, not a person, role, MFA assurance, or high-risk authorization; see [the authentication contract](authentication-contract.md). Individual OIDC/accounts, Resend, passkeys, TOTP, MFA, recovery, and integration-client credentials are later-phase designs and are not implemented initially.
- **Authorization:** server derives Tenant context from trusted identity; a client-supplied Tenant ID can only narrow, never grant, scope.
- **Idempotency:** `Idempotency-Key` required on retriable creates/commands. Store principal, route, normalized request hash, status, and response. Same key+different request returns `409 IDEMPOTENCY_MISMATCH`.
- **Concurrency:** `If-Match`/expected version required for mutable aggregates; stale versions return `409 VERSION_CONFLICT`.
- **Pagination:** opaque signed cursor, stable `(created_at,id)` order, bounded `limit`; filters are explicit and cursor-bound. No offset pagination for mutable lists.
- **Errors:** Problem Details JSON with stable codes: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `IDEMPOTENCY_MISMATCH`, `CAPACITY_UNAVAILABLE`, `PAYMENT_ACTION_REQUIRED`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`; include `request_id`, never secrets.
- **Versioning:** additive compatible changes within `/v1`; breaking changes require a new major path/event version, migration guide, overlap window, and telemetry-backed deprecation.
- **Rate limits:** per principal, Tenant, route, and risk class; `429` includes safe retry guidance.

## Security, PCI, and privacy boundaries

| Boundary | Required control |
|---|---|
| Browser/payment provider | Hosted/tokenized collection; CSP; no PAN/CVC in platform requests, logs, analytics, or storage. |
| API edge | TLS, WAF/rate limits, schema limits, request IDs, authentication before Tenant resolution. |
| Application/database | Deny-by-default authorization, RLS, encryption, parameterized queries, separate production identities. |
| Worker/provider | Egress allow-list, scoped rotating secrets, durable commands, idempotency, circuit breakers. |
| POS/device | Device registration, short-lived credentials, remote revocation, encrypted local cache, operator session. |
| Temporary private-build gate | Salted memory-hard verifier in deployment secrets, locked default, shared rate limiter, short-lived secure session, no production/high-risk capability. |
| Future admin/support | Individual identity, MFA, step-up, time-bound impersonation, reason, banner, immutable attributable audit; postponed. |
| Analytics/reporting | Minimized projections, field-level access, aggregation, asynchronous export, short-lived encrypted artifact, export watermark/audit. |
| Offline device/cloud | Registered device keys, signed manifests/commands, encrypted bounded queue, non-overlapping capacity budget, replay/sequence protection, explicit sync conflicts. |
| Future identity/Resend | Disabled initially. Later phase requires hashed single-use challenges, delivery/authentication separation, passkeys/TOTP policy, recovery, and no provider-outage bypass. |
| Inventory/Yellow Dog | Yellow Dog-authoritative read-only mirror; capability snapshot; shared ≤2 requests/second per-user limiter with `Retry-After`; certified asynchronous sales outbox with stable IDs, idempotent retry, acknowledgement/daily reconciliation; non-sales writes disabled; no credentials in events. |
| Venue audio/Splash Radio | Disabled/manual-first adapter, no customer/payment data, contract/licensing gate, capability allow-list, no emergency/life-safety claim, no blind retry of high-impact controls. |

PCI scope is validated annually; hosted collection reduces but does not eliminate obligations. Threat modeling covers Tenant escape, broken object authorization, account takeover, card testing, webhook forgery/replay, gift-card enumeration/load-drain, refund abuse, double check-in, capacity races, offline conflicts, injection, SSRF, export abuse, and supply-chain compromise.

Privacy uses purpose limitation, data minimization, consent/legal-basis records, subject-access/correction/deletion workflows, regional transfer controls, breach response, and retention enforcement. Exact jurisdictions and periods are **UNVERIFIED (OQ-011, OQ-012)**. The private gate cannot justify live personal data. Detailed reporting, offline, temporary access, and integration constraints are in [Venue operations](operations-integrations-and-reporting.md).
