# Events, Webhooks, API, and Security Boundaries

[Back to index](README.md) · [Invariants](invariants.md) · [Testing](delivery-plan.md#test-strategy)

## Event catalog

Envelope: `event_id`, `event_name`, `event_version`, `tenant_id`, optional `venue_id`, `aggregate_type`, `aggregate_id`, `aggregate_version`, `occurred_at`, `correlation_id`, `causation_id`, and minimized `data`.

| Domain | Canonical events |
|---|---|
| Capacity | `capacity.hold.created.v1`, `capacity.hold.consumed.v1`, `capacity.hold.released.v1`, `capacity.hold.expired.v1`, `capacity.block.changed.v1` |
| Orders | `order.submitted.v1`, `order.confirmed.v1`, `order.canceled.v1`, `order.fulfilled.v1`, `order.refunded.v1` |
| Admissions | `ticket.issued.v1`, `ticket.voided.v1`, `checkin.recorded.v1` |
| Payments | `payment.attempt.updated.v1`, `payment.captured.v1`, `refund.succeeded.v1`, `refund.failed.v1`, `dispute.opened.v1`, `dispute.closed.v1` |
| Stored value | `gift_card.issued.v1`, `stored_value.authorized.v1`, `stored_value.captured.v1`, `stored_value.released.v1`, `gift_card.status_changed.v1` |
| Memberships | `membership.activated.v1`, `membership.billing_failed.v1`, `membership.suspended.v1`, `membership.reactivated.v1`, `membership.terminated.v1` |
| Finance | `journal.posted.v1`, `payout.updated.v1`, `reconciliation.exception_opened.v1`, `reconciliation.exception_closed.v1` |
| Security | `role.binding_changed.v1`, `audit.high_risk_action.v1` |

Aggregate mutation and `OutboxEvent` commit together. Publication is at least once; consumers deduplicate `event_id` and apply valid aggregate versions only. Payloads exclude secrets, raw card data, scan tokens, signatures, and unnecessary PII.

## Provider webhook ingress

1. Accept TLS, bounded request sizes, and provider-specific routes.
2. Preserve raw bytes; derive account context from trusted endpoint configuration.
3. Verify signature, timestamp tolerance, endpoint-secret version, and provider account before trusting content.
4. Insert `WebhookInbox` under unique `(provider, account_context, external_event_id)` with encrypted payload reference/hash.
5. Return 2xx after durable enqueue, then process asynchronously.
6. Retrieve provider state when a snapshot is stale/incomplete; apply only legal monotonic/domain transitions under lock.
7. Commit state, Journal, and outbox atomically.
8. Retry transient failure with exponential backoff and jitter; cap, dead-letter, alert, and allow audited replay.

Delivery is duplicate and unordered. Webhooks provide timeliness, not completeness; reconciliation uses provider reports and bank facts.

## Public webhook delivery

Subscriptions specify Tenant/Venue scope, event allow-list, HTTPS endpoint, secret version, and status. Sign the canonical body. Record attempt metadata, not unsafe response bodies. `2xx` succeeds; redirects fail; retry other transient responses with capped exponential backoff/jitter. Receivers deduplicate `event_id`; replay creates a new delivery, not a new event. Rotation supports overlap and audited revocation.

## API surface

Base path `/api/v1`, JSON over HTTPS:

- `/tenants`, `/venues`, `/users`, `/roles`, `/role-bindings`
- `/products`, `/sessions`, `/capacity-blocks`, `/reservation-holds`
- `/orders`, `/orders/{id}/confirm`, `/orders/{id}/cancel`
- `/tickets`, `/tickets/{id}/check-ins`
- `/payments`, `/payment-attempts`, `/refunds`, `/disputes`
- `/gift-cards`, `/gift-cards/{id}/entries`, `/membership-contracts`
- `/journals`, `/reconciliation-exceptions`, `/webhook-subscriptions`, `/events`

### API contract

- **Auth:** OIDC/OAuth 2.1 authorization code with PKCE for users; scoped private-key/client credentials for integrations; short-lived audience-bound tokens; MFA/step-up for high risk.
- **Authorization:** trusted identity resolves Tenant; client Tenant input only narrows scope.
- **Idempotency:** required on retriable creates/commands; persist principal, route, normalized hash, status, response. Same key/different input returns `409 IDEMPOTENCY_MISMATCH`.
- **Concurrency:** `If-Match` or `expected_version`; stale writes return `409 VERSION_CONFLICT`.
- **Pagination:** opaque signed cursor, stable `(created_at,id)` order, bounded limit, cursor-bound filters.
- **Errors:** Problem Details JSON and stable codes `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `IDEMPOTENCY_MISMATCH`, `CAPACITY_UNAVAILABLE`, `PAYMENT_ACTION_REQUIRED`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`; include `request_id`, never secrets.
- **Versioning:** additive changes within v1; breaking changes require new API/event version, migration guide, overlap, and telemetry-backed deprecation.
- **Rate limits:** per principal, Tenant, route, and risk class; `429` includes safe retry guidance.

## Security, PCI, and privacy boundaries

| Boundary | Required controls |
|---|---|
| Browser/provider | Hosted/tokenized collection, CSP, no PAN/CVC in platform requests/logs/storage |
| API edge | TLS, schema/size/rate limits, authentication before Tenant resolution |
| Application/database | Deny-by-default authorization, RLS, encryption, parameterized queries, separate production identities |
| Worker/provider | Egress allow-list, scoped rotating secrets, durable idempotent commands, circuit breakers |
| POS/device | Registration, short-lived credentials, remote revocation, encrypted cache, operator session |
| Admin/support | MFA, step-up, time-bound impersonation, reason, banner, immutable audit |
| Analytics/export | Minimized projections, field access, aggregation, short-lived artifacts, download audit |

Hosted collection reduces but does not eliminate PCI obligations; validate scope annually. Threat models cover Tenant escape, BOLA/IDOR, takeover, card testing, webhook forgery/replay, gift-card load/drain, refund abuse, double CheckIn, capacity races, injection, SSRF, export abuse, and supply-chain compromise. Privacy uses purpose limitation, minimization, consent/legal-basis records, subject-rights workflows, transfer controls, breach response, and policy-driven retention; exact obligations are **UNVERIFIED (OQ-010)**.
