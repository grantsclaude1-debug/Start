# Entity and Data Model

[Back to index](README.md) · [Modules](modules-and-permissions.md) · [Lifecycles](commerce-lifecycles.md) · [Finance](finance-lifecycles.md)

## Identity, versioning, and time

- IDs are opaque UUIDv7 values encoded canonically; human-facing codes are separate, random, rotatable, and never database keys.
- Mutable aggregates carry integer `version`; commands supply `expected_version`; a mismatch returns `CONFLICT`.
- Timestamps are UTC `timestamptz` with microsecond precision and names ending `_at`. Business dates are explicit `date` values. A Venue stores an IANA `timezone`; schedule input stores local wall time, zone, and resolved UTC instants, including daylight-saving ambiguity resolution.
- Soft deletion is not a financial lifecycle. Mutable reference data may use `archived_at`; immutable evidence uses retention policy and authorized redaction/tombstones.

## Money and currency

- Monetary columns are signed 64-bit integers in minor units plus ISO 4217 `currency`; no binary floating point.
- Every Order, Payment, GiftCard, Journal, and payout grouping is single-currency. Cross-currency movement creates explicit FX records and balanced currency-specific journals.
- Rounding mode and tax allocation are versioned policies; line allocations must sum exactly to document totals.
- Provider amounts are normalized only after validating provider currency exponent and bounds.

## Core relational model

| Entity | Required fields and constraints |
|---|---|
| Tenant | `id`, `status`, `default_locale`; isolation root. Initial configuration allows one active row for the launch venue. |
| Venue | `id`, `tenant_id`, `timezone`, address/tax-location reference, `status`; initial configuration allows one active Venue. |
| User / Role / RoleBinding | Principal, permission set, Tenant/Venue scope, validity interval, version. |
| Product | Type, status, sale policy; prices/schedules are separate and versioned. |
| Session | Product/Venue, UTC interval, local-time facts, `capacity_pool_id`, status. |
| CapacityPool | `capacity_total >= 0`; available quantity is a locked projection of confirmed, held, and blocked quantities. |
| CapacityBlock | Pool, interval, quantity, reason, active/canceled state. |
| ReservationHold | Session/pool, quantity, `status`, `expires_at`, owner/session key, idempotency key, version. |
| Order | Customer reference, `status`, currency, totals, source channel, version. |
| OrderLine | Immutable product/price/tax/service snapshot, quantity, allocations, optional Session ID. |
| Ticket | OrderLine, Session, `status`, validity, random token hash, version. |
| CheckIn | Ticket, result, occurred/recorded times, device/operator, idempotency key; append-only. |
| Payment | Payable ID/type, currency, requested/allocated/captured/refunded amounts, derived status. |
| TenderAllocation | Payment, tender type, amount, priority, GiftCard/provider reference. |
| PaymentAttempt | Payment, provider/account/channel, amount, capture mode, canonical status, provider reference, business idempotency key. |
| Refund | Payment/allocation, amount, reason, approval, canonical status, provider reference. |
| Dispute | PaymentAttempt, amount/fee/deadline, canonical status, evidence manifest reference. |
| GiftCard | Tenant, currency, token hash, status, expiry-policy snapshot; balance is a projection. |
| StoredValueEntry | GiftCard, type, amount, balance-after, source ID, idempotency key; append-only. |
| MembershipContract | Customer, plan snapshot, contract status, billing status, entitlement status, effective interval, version. |
| Journal / Posting | Source uniqueness, posting-rule version, effective time; per-Journal debits equal credits in one currency. |
| WebhookInbox | Provider/source, external event ID, raw-payload encrypted reference/hash, verification and processing state. |
| OutboxEvent | Event name/version, aggregate ID/version, payload, availability/publication state. |
| AuditEntry | Actor, action, target, before/after hashes or redacted diff, reason, request/correlation ID, time. |
| ReportDefinition / ExportJob | Stable report/version, plain-language field definitions, filters, requester/scope, status, artifact hash/reference, row count, expiry, download audit. |
| IntegrationConnection / IntegrationMapping | Adapter kind/version, disabled/enabled state, secret reference, capability contract, external/internal IDs, mapping version, health/checkpoint. |
| InventoryLocation / InventoryItem / InventoryItemMapping | Yellow Dog-authoritative store/item/SKU/UPC/unit/recipe references, local revenue-center mapping, source timestamps/hash/transform version, sync cursor and freshness; read-only mirror. |
| InventorySourceSnapshot | Yellow Dog vendor, recipe, purchase-order, receipt, transfer, count-sheet or on-hand fact with source ID/state/time, observed time, payload hash/reference and freshness; read-only mirror. |
| YellowDogCapabilitySnapshot | Transport/API version, per-resource read flags, sales-write flag, disabled non-sales write flags, certification/permission evidence, rate-limit policy and effective interval. |
| InventorySaleCommand / InventoryAck | Finalized sale/return/void/correction with stable Yellow Dog transaction/line IDs, mapped store/item/recipe/unit, immutable payload hash, idempotency key, attempt/acknowledgement/remote-evidence/reconciliation state. |
| VenueAudioConnection / AudioZone | Provider/mode/status/capabilities/licensing and venue audio zone/hardware references; no customer/payment data. |
| AudioContentRef / AudioSchedule | External content metadata/rights approval and versioned zone/timezone schedule intent; no copied audio. |
| AudioCommand / AudioHealthSnapshot | Idempotent allow-listed control intent/result and append-only player/connectivity observation. |
| DeviceRegistration | Venue/device identity, signing public key, status, assurance, last sync, revocation. |
| OfflineManifest / OfflineCapacityBudget / OfflineStockBudget | Signed validity window, ticket/policy snapshot reference, edge/device Session or SKU allocation, issued/remaining quantity. |
| OfflineCommand | Origin (`edge_id` or `device_id`), epoch/sequence, offline session, occurred time, manifest/policy version, payload hash/signature, canonical resolution; append-only. |
| GateConfig / GateSession / GateAttempt | Versioned salted verifier secret reference/algorithm, hashed short-lived session, and minimized rate-limit/audit outcome; never plaintext passcode. `AuthChallenge` and individual credentials are future-phase entities only. |

## Keys and constraints

- Unique `(tenant_id, business_idempotency_key)` on business commands, PaymentAttempt, Refund, CheckIn, and StoredValueEntry where applicable.
- Unique `(provider, account_context, external_event_id)` on WebhookInbox.
- Unique `(source_type, source_id, posting_rule_version)` on Journal.
- Unique active Ticket token hash; plaintext scan tokens are never logged.
- Refund captured sum cannot exceed refundable captured allocation; GiftCard available balance cannot fall below zero; capacity committed plus held plus blocked cannot exceed total.
- All foreign keys include or validate Tenant identity; database row-level security denies missing Tenant context.
- Unique `(origin_id, origin_epoch, origin_sequence)` and `(origin_id, idempotency_key)` protect offline ingestion; sequence reuse with a different payload hash is a security incident.
- Export artifacts are not database blobs: store an encrypted object reference/hash, short expiry, and audited download events.
- Integration mappings are versioned and never silently substitute units, locations, SKUs, recipes, or external identifiers.
- Yellow Dog mirror rows are source-owned and cannot be mutated through application commands; absence from incremental polling never implies deletion without vendor-confirmed tombstone evidence.
- Unique canonical event/idempotency key and stable `thirdPartyId`/`thirdPartyLineId` mapping prevent duplicate Yellow Dog sales submission; retries preserve identifiers and payload semantics.
- Yellow Dog capability snapshots deny operations not explicitly documented, permitted, tested, and certified; launch enables reads and certified sales submission only.

## Audit and retention classes

| Class | Examples | Rule |
|---|---|---|
| Financial evidence | Journal, postings, refunds, disputes, reconciliation | Immutable; retain for owner/legal-approved period (`OQ-011`). |
| Security/audit | Role changes, authentication, impersonation, admin actions | Append-only, access restricted, integrity monitored. |
| Operational | Orders, holds, tickets, check-ins, memberships | Retain/minimize according to contract and legal basis. |
| Sensitive customer data | Contact details, waiver references | Encrypt, field-limit, access-log, delete/anonymize when no longer required. |
| Transient | Raw provider payload, idempotency response | Encrypt and expire after approved replay/audit window. |

Erasure removes or pseudonymizes personal fields without deleting financial or audit facts that must be retained; retained records hold non-reversible subject references where feasible.
