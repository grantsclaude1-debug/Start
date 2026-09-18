# Venue Operations, Reporting, Offline Mode, Authentication, and Integrations

[Back to index](README.md) · [Requirements](product-requirements.md) · [API/security](interfaces-and-security.md) · [Delivery plan](delivery-plan.md) · [Owner questions](unknowns-and-owner-questions.md)

## Approved operating context

| Status | Decision |
|---|---|
| CONFIRMED | The initial product serves the launch venue as one Venue and one payment-collecting merchant. The launch architecture does not use Stripe Connect. |
| CONFIRMED | Ticket sales are the highest product priority. Owner and VenueManager workflows are the primary administrative experience. |
| CONFIRMED | Reports must be simple to understand and easy for an authorized user to download. |
| CONFIRMED | All ROLLER data made available through an approved read-only mechanism is in migration scope; the source must never be modified. |
| CONFIRMED | Yellow Dog is the current inventory system. No Yellow Dog login or private contract was available for this specification. |
| CONFIRMED | Useful venue operations must continue through bounded internet and power disruptions. |
| CONFIRMED | The initial private build uses one temporary shared passcode gate. Resend, passkeys, TOTP, MFA, recovery, and individual accounts are postponed to a later owner-approved phase. |
| CONFIRMED | Integration seams are required for every observed external system; the detailed external-software inventory will be revisited later. |

The schema retains `Tenant` and `Venue` boundaries to avoid unsafe global rows, but launch configuration permits exactly one active Tenant and one active Venue. Multi-venue administration and cross-merchant funds routing are non-goals for the initial release.

## Reporting product

### Report experience

Reports are read models, never direct queries against write tables. Each report has a plain-language title, one-sentence purpose, visible data freshness, understandable filters, definitions for every total, drill-through only when authorized, and an explicit download action. Default dashboards prioritize today’s ticket sales and venue operation.

Initial report families:

1. **Today at a glance:** tickets sold, expected arrivals, accepted check-ins, remaining timed capacity, cancellations, refunds, and operational exceptions.
2. **Ticket sales:** quantity and net sales by service date, purchase date, product, session, and channel.
3. **Capacity and attendance:** sold, held, blocked, remaining, checked in, no-show, and utilization by Session.
4. **Orders and refunds:** orders, payment status, tender split, refunded amount, and reason categories.
5. **Payment reconciliation:** captures, fees, refunds, disputes, payouts, bank matches, and unresolved exceptions.
6. **Gift-card liability and memberships:** issuance/redemption/balance and contract/billing/entitlement status.
7. **Inventory integration health:** outbound sale/depletion commands, acknowledgements, failures, and unmapped SKU references; not a replacement for Yellow Dog inventory accounting.
8. **Audit and access:** high-risk actions, exports, permission changes, and authentication events.

Downloads are asynchronous `ExportJob` records. CSV is the required machine-readable baseline; a human-readable PDF is provided only for reports whose layout is explicitly designed and tested. Spreadsheet format, exact report catalog, retention, masking, maximum row count, and scheduled delivery remain **UNVERIFIED (OQ-022)**. Every export records requester, scope, filters, row count, purpose, hash, expiry, and download events. The temporary shared gate cannot authorize sensitive exports, so they remain disabled; a later individual-authentication phase requires MFA/step-up, short-lived signed URLs, encryption, and no public object access.

### Report acceptance criteria

- An owner or manager can answer “how many tickets sold, expected, checked in, refunded, and remaining today?” in at most three interactions.
- Report totals reconcile to canonical Orders, Tickets, CheckIns, Journals, and provider/bank control totals.
- Every total has an on-screen definition and freshness time.
- CSV values use stable headers, ISO dates/times, explicit currency, and no locale-dependent ambiguity.
- A 100,000-row export runs outside request threads, does not slow checkout/check-in beyond the approved service objective, and produces one audited artifact or a clear failure.

## Offline and disruption operating model

The implementation-level requirements, Stripe constraints, recovery objectives, conflict rules, and acceptance tests are in [Offline venue operations architecture](offline-operations.md); that document controls if this summary differs.

“Offline” is a bounded degraded mode, not an independent second system of record. It cannot promise unlimited duration, globally current capacity, guaranteed card authorization, email delivery, cloud reporting, or conflict-free edits. **Software cannot operate through a total power loss without powered hardware:** when device and UPS battery power is exhausted, electronic POS, check-in, waiver, ticket lookup, and payment functions stop.

### Launch continuity envelope

The implementation must be engineered and tested to the following **UNVERIFIED operational assumptions (OQ-021)** until site measurements approve replacements:

- Registered POS/check-in devices provide at least four hours of usable battery at operational brightness and scanning load.
- The local router, network switch, Wi-Fi access points, and venue edge coordinator are backed by a monitored UPS sized for at least 30 minutes of required-lane operation plus 10 minutes reserved for clean shutdown; this is a design default, not a claim about installed equipment.
- The local encrypted event queue supports at least one peak operating day and expires admission/cache data under the approved retention policy.
- Devices synchronize within five minutes of connectivity recovery under the measured peak backlog; otherwise an owner-visible incident remains open.
- A complete loss of device power stops digital sale/check-in. Paper emergency procedures may exist, but are outside the authoritative digital ledger unless later entered through an audited recovery workflow.

### Allowed degraded operations

| Operation | Internet unavailable, local power available | Cloud and local mains unavailable but device/UPS power available | Hard limit |
|---|---|---|---|
| Check existing tickets | Use a signed, encrypted, freshness-stamped admission manifest and local spent-token set | Same while device and local network remain powered | Provisional results sync later; stale/revoked/duplicate conflicts enter review |
| Sell cash tickets | Allocate only from a pre-issued offline capacity budget; create locally signed Order/Ticket facts | Same while approved device remains powered | No sale after the device’s capacity budget is exhausted or manifest expires |
| Sell card tickets | Only through a provider- and hardware-supported offline/store-and-forward mode with explicit owner risk limits | Same if reader/device has power | Local approval is not final authorization; otherwise card sale is unavailable |
| Gift cards/memberships | Read cached status only when policy permits; do not change shared balance or membership contract by default | Same | Value-changing actions remain online unless a separately tested risk policy exists |
| Refunds, disputes, role/config changes, exports | Unavailable | Unavailable | Queueing these high-risk changes offline is prohibited |
| Temporary private-build gate | Existing short-lived gate session may continue until expiry while its server-side verifier/session/limiter dependencies remain reachable | No new gate session when authoritative verification/session state is unreachable | Never cache the shared passcode or create offline operator grants; Resend/MFA are not implemented initially |

### Offline synchronization

Each edge/device origin owns a durable epoch/sequence and signing key. An offline command contains `origin_id`, `origin_epoch`, `origin_sequence`, `offline_session_id`, `occurred_at`, cached-policy version, manifest version, idempotency key, and signature. Server ingestion verifies registration/signature, rejects sequence reuse with different content, stores the raw command before processing, and returns a canonical resolution: `ACCEPTED`, `DUPLICATE`, `CONFLICT`, `EXPIRED_POLICY`, or `MANUAL_REVIEW`.

Capacity is bounded by allocating non-overlapping per-device offline budgets from the central CapacityPool before loss of connectivity. Offline CheckIns use a local spent-token set and cannot guarantee that another disconnected device did not admit the same Ticket; cross-device duplicates are surfaced after sync and never silently erased. Clock drift beyond the approved tolerance blocks new offline sales and marks scans for review. Device queues are encrypted, size-bounded, observable, and never contain raw card data or unnecessary PII.

## Temporary private-build access boundary

The initial build uses one shared passcode gate governed by [the authentication contract](authentication-contract.md). Deployment provides only a versioned salted memory-hard verifier through a protected secret/configuration reference; no plaintext, default, sample, hard-coded, or committed passcode exists. Verification is server-side and rate-limited across source and deployment-wide buckets. A successful check creates a short-lived secure gate session and grants only `PRIVATE_BUILD_ACCESS`.

The shared gate does not identify a person, establish Owner/VenueManager role, provide MFA/step-up, or satisfy approval/separation-of-duty controls. Therefore production payments/refunds, sensitive exports, real-data migration, role/secret/configuration changes, external sends, and production adapters remain disabled. Audit records use `private_gate_session`, never a human actor.

Resend, email verification/OTP, passkeys, TOTP, invitations, recovery, individual accounts, and attributable role sessions are not implemented in this phase. They remain recommended later work under **UNVERIFIED OQ-024** and require a new owner-approved threat model and rollout gate. There is no authentication bypass or automatic upgrade from a gate session to a future individual session.

## Integration architecture

All integrations implement a versioned adapter contract: capability discovery/configuration, authentication by secret reference, health check, cursor/checkpoint, pull, push command, acknowledgement, retry classification, idempotency, replay, mapping version, reconciliation, and disable/revoke. External calls run through durable commands/outbox workers; no checkout database transaction waits on a non-payment partner.

Observed integration seams to preserve:

| System/capability | Initial direction | Boundary |
|---|---|---|
| Stripe | Bidirectional payment provider adapter | Tokenized payments, refunds, disputes, payouts; no Connect initially |
| Yellow Dog Inventory | Read-only local mirror plus certified asynchronous/idempotent sales submission | Yellow Dog is inventory authority; all non-sales writes remain capability-gated and disabled |
| Resend | Disabled placeholder; future outbound email/delivery-status adapter | No initial implementation or sends; future verification/security messaging requires OQ-024 approval |
| Fresh KDS | Order-ticket output adapter | Kitchen display messages; no assumption about private webhook schema |
| Campaign Monitor | Consent-controlled audience/event export adapter | Marketing only; never receives payment, waiver, or unnecessary admission data |
| Groupon/channel partners | Voucher/order/redemption adapter | Exact identifiers, settlement, and reversal behavior are contract-dependent |
| Xero/accounting | Reviewed export/API adapter | No automatic posting until accountant-approved mappings and controls exist |
| ROLLER | Read-only migration/import adapter only | No writeback, source mutation, or runtime dependency after cutover unless separately approved |
| Splash Radio / venue audio | Disabled/manual-first `VenueAudioAdapter`; exact vendor capabilities contract-dependent | Music/schedule/player health only; never a ticketing or life-safety dependency; see [adapter specification](splash-radio-adapter.md) |
| Generic API/webhooks | Scoped public integration surface | Versioned contracts, signed webhooks, replay, least privilege |

External software not yet inventoried uses a disabled placeholder adapter record; it receives no data until its purpose, owner, fields, lawful basis, contract, authentication, retry, reconciliation, and deletion behavior are approved (**UNVERIFIED OQ-026**).

## Yellow Dog inventory adapter

The controlling evidence is a separately retained Yellow Dog clean-room adapter contract synthesized from official public Yellow Dog product, help-center, and developer documentation only; it is intentionally excluded from this prototype repository.

### Ownership and launch direction

| Domain | Authority | Launch behavior |
|---|---|---|
| Venue sale/return/void/correction lifecycle | Venue platform | Finalize locally; submit asynchronously to Yellow Dog after certification |
| Items, SKU/UPC, inventory classification | Yellow Dog | Read-only local replica |
| Stores/on-hand | Yellow Dog, with owner-approved local mapping | Read-only snapshots with visible freshness; never a checkout hard dependency |
| Recipes/depletion rules | Yellow Dog | Read-only local replica |
| Vendors/vendor-item links | Yellow Dog | Read-only local replica |
| Purchase orders, receipts/invoices, transfers | Yellow Dog | Read-only when permitted; no platform writes initially |
| Counts/physicals, waste/manual adjustments | Yellow Dog | Observe where documented; no platform writes initially |
| Queue, retry, mapping, audit, reconciliation | Venue platform | Durable local ownership |

The launch sequence is: (1) capability/credential discovery, (2) read-only mirror, and (3) Yellow Dog-certified sales submission. Checkout, ticketing, admission, and offline venue operation never wait synchronously on Yellow Dog.

### Verified public contract

- Fetch API calls use bearer tokens; the documented exchange uses a Yellow Dog database username, password, and API client ID. Access tokens are documented for one hour and single-use refresh tokens for 30 days.
- The public API limit is **2 requests/second per user**. Use a shared token bucket below that ceiling, honor `429 Retry-After` exactly, and serialize refresh-token rotation.
- Collection pages default to 100 and allow up to 500. Item configuration supports `lastUpdated`; the next cursor uses the refresh cycle start time. On-hand must be pulled separately through `POST /inventory` because item updates do not prove current on-hand.
- Public guidance favors an initial full pull plus incremental polling into the consumer’s datastore rather than live page-serving calls.
- `POST /transactions` accepts individual or batched sales. Stable `thirdPartyId` and `thirdPartyLineId` identify transactions/lines; retries preserve IDs. Reusing IDs for corrections is allowed only according to the certified mapping.
- Yellow Dog requires an agreement/access/certification path for new integrations. Sales Sync file transport is also documented, but its security, file-acknowledgement, and exact mapping remain contract-dependent.
- No public webhook/event-subscription contract was evidenced; polling/file processing is the initial assumption, not a claim that private webhooks cannot exist.

### Capability contract

Every connection stores a versioned capability snapshot. An operation is callable only when the corresponding flag is true and its permission/certification evidence is attached.

```ts
type YellowDogCapabilities = {
  transport: "fetch-api" | "sales-sync-file" | "custom-certified";
  apiVersion: "v3" | "unknown";
  read: {
    stores: boolean; items: boolean; vendors: boolean; recipes: boolean;
    purchaseOrders: boolean; receipts: boolean; transfers: boolean;
    countSheets: boolean; onHand: boolean; accounting: boolean;
  };
  write: {
    sales: boolean;
    items: false; vendors: false; purchaseOrders: false;
    uncommittedReceipts: false; commitReceipts: false;
    transfers: false; manualAdjustments: false;
    counts: false; recipes: false;
  };
  webhooks: false;
};
```

`false` means disabled for this launch, not necessarily unsupported by Yellow Dog. Item, vendor, purchase-order, receipt, transfer, count, waste/manual-adjustment, and recipe writes remain disabled until Yellow Dog supplies an exact documented contract, account permission, non-production test path, mapping/state-transition rules, and certification for that capability. Public documentation specifically does not establish count or recipe writes and says committed receipt inventory effects occur in the Yellow Dog client.

### Mirror, sales outbox, and identifiers

The read-only mirror stores source IDs/timestamps, raw-response hash/reference, transform version, sync cycle/cursor, observed time, and freshness. It covers permitted stores, items, vendors, recipes, purchasing documents, receipts, transfers, count-sheet definitions, and on-hand. Absence from an incremental item response is not proof of deletion; periodic full reconciliation and vendor-confirmed tombstone rules control deactivation.

A finalized stock-bearing sale/return/void/correction commits its canonical transaction and Yellow Dog outbox command atomically. Commands contain stable transaction and line IDs, mapped store GUID, certified item GUID/SKU/UPC or POS-item-to-recipe reference, quantity, retail/discount facts required by the contract, lifecycle, payload hash, and business idempotency key. A retry never generates new IDs. Timeout is `UNKNOWN`, not success; retrieve by external ID or wait for certified file/reconciliation evidence before completing.

Missing store/item/recipe/unit mapping quarantines the command and opens an exception. It never silently substitutes an identifier and does not block local ticket issuance. Returns, voids, modifiers, negative/zero quantities, and corrections follow only the certified mapping.

### Reconciliation and error handling

At minimum run:

1. **Daily sales control:** counts and net quantity/retail by business date, store, and item/recipe;
2. correction control for return/void/correction IDs and latest payload hash;
3. mapping control for stores, GUIDs, SKU/UPC, units, and POS-item-to-recipe links;
4. on-hand freshness by store and age threshold;
5. purchasing/receipt state/count control for replicated resources; and
6. periodic full item active/inactive/missing control without treating omission as deletion.

Classify errors as `AUTH_EXPIRED`, `AUTH_FORBIDDEN`, `RATE_LIMITED`, `TRANSIENT_REMOTE`, `VALIDATION_FAILED`, `MAPPING_MISSING`, `DUPLICATE_OR_COLLISION`, `SCHEMA_DRIFT`, `PARTIAL_BATCH`, or `FILE_REJECTED`. Persist attempts, safe response hash/details, acknowledgement, next retry, and remote evidence. Dead letters preserve the original canonical payload and IDs; replay requires cause resolution. Manual force-complete requires an audit reason and remote evidence.

### Credentials and unresolved vendor questions

Credentials live only in the approved secret manager and never in source, browser storage, logs, events, or workspace documents. Prefer a dedicated least-privilege non-human integration identity, separate test/production credentials, outbound host allow-listing, TLS, and serialized compare-and-swap refresh-token storage.

The following remain **UNVERIFIED (OQ-023)** and block connection enablement: exact Yellow Dog modules/version/topology; API agreement/SOW/fees; sandbox and reset process; dedicated service account and permissions; credential/MFA/rotation/revocation/IP/mTLS behavior; account-specific limits and endpoint access; webhook availability; store/item/recipe/unit/correction mappings; ROLLER coexistence/cutover; sales certification/acknowledgement report; write-capability certification; support/SLA; and recovery after outage, token expiry, partial batch, duplicate, or file rejection.

Until those questions are answered and separate connection approval occurs, use the fake adapter and synthetic fixtures only. No credential request or external connection is authorized by this specification.
