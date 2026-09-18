# Offline Venue Operations Architecture

[Back to index](README.md) · [Labels](terminology-and-evidence.md#status-labels) · [Invariants](invariants.md)

**Scope:** the single launch venue, one merchant, one local area network (LAN), and a cloud control plane. This is an independent design, not an inference about ROLLER internals.

## 1. Non-negotiable boundary

> **Software cannot operate through a total power loss without powered hardware.**

An internet outage and a power outage are different incidents. The local edge service only helps while the edge computer, network switch/router/access points, POS/check-in devices, payment readers, scanners, and any required printer remain powered. A UPS can bridge a bounded outage or permit a clean shutdown; it does not provide indefinite operation. When usable battery power is exhausted, electronic POS, check-in, waiver capture, ticket lookup, synchronization, and card acceptance stop. The venue must then close electronic lanes or use an approved paper-only safety procedure.

## 2. Operating modes

| Mode | Trigger | Allowed | Not allowed |
|---|---|---|---|
| `ONLINE` | Cloud, LAN, edge, and provider health pass | Normal operation | None beyond normal policy |
| `WAN_DEGRADED` | Internet/provider path unhealthy; LAN and edge healthy | Cached catalog, bounded walk-up sales, cash, qualified Stripe Terminal offline payments, local ticket verification/check-in, cached waiver verification, new local waivers, allocated capacity/inventory | Cloud-only admin, unbounded sales, uncached lookup, online-only tenders, refunds, gift-card/membership balance changes unless a reserved offline allowance exists |
| `EDGE_DEGRADED` | Cloud reachable but venue edge unavailable | Cloud workflows that do not require edge; one clearly selected fallback lane | Pretending devices share a local redemption/capacity state |
| `LAN_PARTITIONED` | Edge is running but one or more lanes cannot reach it | Affected lane may scan signatures for authenticity only and use a separately preallocated lane budget | Shared-capacity sales or definitive first-entry decisions from an isolated lane |
| `UPS_MODE` | Utility power lost; UPS healthy | Same as current data mode, with battery timer and staged shutdown | Starting optional equipment or assuming unlimited runtime |
| `SAFE_STOP` | UPS reserve reached, edge integrity uncertain, clock outside tolerance, cache expired, or risk ceiling reached | Cash-only paper procedure if management and life-safety policy permit; otherwise pause admission/sales | Electronic assurances the system can no longer prove |
| `RECOVERY` | Connectivity/power returns | Forward, reconcile, quarantine exceptions, then reopen normal functions by gate | Silent auto-merging of money, capacity, redemption, or consent conflicts |

The mode banner must name the failure, remaining battery/risk budget, unavailable functions, and the next safe operator action. Color alone is insufficient.

## 3. Physical and network architecture

```text
Cloud control plane
  API + primary database + workers + Stripe/webhooks + reporting
                         |
                    Internet/WAN
                         |
UPS A: firewall/router + managed PoE switch + staff APs
                         |
        +----------------+----------------+
        |                                 |
UPS B: edge appliance                 Battery/UPS lanes
  local API + database                POS tablets/terminals
  sync worker + audit                 check-in scanners
  local time/health                   waiver kiosks/printer
        |
Warm standby edge appliance (recommended; manual fenced failover)
```

### Hardware requirements

| ID | Status | Requirement |
|---|---|---|
| OFF-HW-001 | CONFIRMED | The deployment documentation MUST state that total power loss stops software unless every required component remains powered. |
| OFF-HW-002 | INFERRED | The firewall/router, core switch, staff Wi-Fi access points, primary edge appliance, standby edge appliance, and at least one POS and one check-in lane MUST be on sized UPS/battery power. |
| OFF-HW-003 | INFERRED | UPS sizing MUST be based on measured watt load and battery test, not nameplate optimism. The owner-selected target is recorded after a live pull-the-plug test; the design default is 30 minutes at required-lane load plus 10 minutes reserved for clean shutdown. |
| OFF-HW-004 | INFERRED | Nonessential loads (guest Wi-Fi, displays, optional printers) MUST be on separate circuits or shed first. Life-safety systems are outside this application and MUST never depend on it. |
| OFF-HW-005 | INFERRED | UPS telemetry MUST reach the edge. At reserve threshold the edge MUST stop new offline card transactions, checkpoint the database/outbox, show `SAFE_STOP`, and shut down cleanly. |
| OFF-HW-006 | INFERRED | Smart payment readers that require the POS device and reader to communicate over a LAN MUST remain on the same powered LAN. A battery-powered reader alone is insufficient. |
| OFF-HW-007 | INFERRED | The primary and warm standby MUST use encrypted SSDs, secure boot where supported, automatic screen lock, tamper-evident asset labels, and locked mounting. |
| OFF-HW-008 | INFERRED | Warm-standby promotion MUST be manual and fenced: confirm the primary is stopped/unreachable, record manager identity/reason, promote once, and prohibit automatic dual-primary operation. |

A two-node database that can both accept writes during a partition is prohibited. If automatic failover is later required, use a properly tested quorum design with an independent third vote; do not use the cloud as the only witness for a WAN-outage system.

## 4. Edge service and local cache

The edge is a venue-scoped service, not a second independent system of record. It holds a bounded operational projection and a durable journal of locally originated facts.

### Required components

- Local HTTPS API and device registry.
- Transactional relational database in write-ahead-log mode.
- Atomic capacity/inventory allocator for the venue's offline partitions.
- Ticket-signature verifier and local redemption registry.
- Waiver template/evidence cache.
- POS/order/till service.
- Transactional outbox, cloud inbox, deduplication store, and synchronization worker.
- Append-only audit chain and health/UPS/clock monitor.
- Read-only recovery console for managers.

### Data and security requirements

| ID | Status | Requirement |
|---|---|---|
| OFF-DATA-001 | INFERRED | Cache only the minimum needed for the next operating window: current/next-day sessions, sellable price snapshots, allocated capacity and stock, tickets likely to arrive, ticket void/revocation state, waiver status/evidence references, limited guest lookup fields, device/staff grants, and public verification keys. |
| OFF-DATA-002 | INFERRED | Never cache PAN, CVC, magnetic-stripe data, provider secrets, reusable cloud admin credentials, or full payment webhook payloads. Stripe Terminal SDK/readers own their protected offline payment storage. |
| OFF-DATA-003 | INFERRED | Encrypt the volume and sensitive fields with maintained-library AES-256-GCM authenticated encryption; use a unique CSPRNG nonce per key, bind record/schema context as associated data, and release no plaintext before tag verification. Keep the data-encryption key in OS/hardware-backed key storage; wrap it with a venue/device key; never store the key beside an unprotected database copy. [S12][S13] |
| OFF-DATA-004 | INFERRED | Device certificates and operator grants MUST be individually revocable. Cached staff grants MUST be signed, venue/role/device scoped, and expire after at most one operating day; privileged configuration, refunds, exports, staff changes, and key changes require online step-up. |
| OFF-DATA-005 | INFERRED | Cache freshness MUST be visible. Ticket/waiver/catalog data older than its policy limit causes that feature to fail closed or move to manager exception; it must not silently appear current. |
| OFF-DATA-006 | INFERRED | Edge backups MUST be encrypted, integrity checked, excluded from ordinary user access, and restored in quarterly drills. A backup is not accepted until a restore has succeeded. Key inventory, purpose, activation/retirement, rotation, compromise response, and destruction evidence MUST follow a documented lifecycle. [S14] |
| OFF-DATA-007 | INFERRED | Device clocks MUST use the edge as the LAN time source; the edge compares against trusted time whenever online. More than 120 seconds of skew blocks time-sensitive sales and marks scans for manager review. Monotonic time is used for local expiry timers. |
| OFF-DATA-008 | INFERRED | Cache deletion/retention MUST follow approved privacy and legal periods; offline convenience does not justify indefinite local PII. |

OWASP recommends minimizing sensitive storage, using authenticated encryption modes, and implementing tested key-generation, distribution, rotation, and decommissioning processes [S5].

## 5. Offline functional rules

### 5.1 POS and orders

1. Each offline order gets a globally unique `order_id`, `edge_id`, monotonically increasing `edge_sequence`, immutable price/tax snapshot, operator/device identity, and local timestamp plus last trusted cloud time.
2. Creating the order, tender record, capacity/stock consumption, audit record, and outbox event is one local database transaction. The UI must not show **Completed** before that commit succeeds.
3. Offline discounts are limited to cached rules. Manual discount, price override, tax override, void, or no-sale drawer opening requires a cached manager grant and reason.
4. Email/SMS receipts are queued, not described as sent. A printable/local receipt says `OFFLINE — PAYMENT MAY BE PENDING` when applicable.
5. Offline returns, card refunds, gift-card loads, membership billing changes, and cross-order tender changes are disabled unless a separate, formally specified reserved-value protocol exists.

### 5.2 Cash

- Cash is the lowest external-dependency tender but still requires powered POS/edge equipment for electronic records.
- One till belongs to one lane/operator session. Record opening float, every sale/void/drop, closing blind count, variance, and manager approval.
- Configure maximum cash-in-drawer and mandatory safe-drop thresholds outside source code.
- Cash orders commit immediately to the local ledger/outbox; later cloud sync cannot change the fact that cash was physically accepted.
- Offline cash refunds are disabled by default. If management later enables them, require original receipt, manager approval, reason, per-refund/shift ceilings, and a separate append-only payout record.

### 5.3 Card and Stripe Terminal

`offline card accepted` means **card data was stored for later authorization**, not that the issuer approved the payment. Goods/admission may be delivered before authorization, so the merchant bears decline and tamper risk.

#### Current official Stripe constraints that the product must enforce

- Stripe says offline authorization occurs only after connectivity returns and the payment is forwarded; unrecoverable declines/tamper losses are the merchant's risk [S1].
- Offline mode must be enabled for the Terminal `Location`/configuration and supported SDK/reader [S1].
- Mobile reader use requires an online connection to the same reader type/location and current reader software within the preceding 30 days; clearing/reinstalling the POS app can erase unforwarded SDK-held payments [S1].
- Smart readers require the same reader to have connected with a valid token within 24 hours and, for separate POS devices, the POS and reader must stay on the same LAN; Apps on Devices still needs a LAN at boot [S2].
- Stripe's documented hard offline maximum is USD 10,000 or equivalent **per transaction**, but Stripe encourages lower merchant controls and an aggregate stored-payment ceiling [S1][S2]. This hard ceiling is not a safe venue policy.
- The current guide documents no fixed Stripe aggregate-dollar cap, payment-count cap, or maximum store-and-forward retention period. Therefore the venue MUST impose its own lower aggregate/time ceilings; the 24-hour and 30-day values above are reader connection-eligibility windows, not payment-retention promises [S1][S2].
- Swipe is unavailable offline. Supported offline methods include major listed card networks and NFC wallets, subject to market rules; Interac, NYCE/PULSE/STAR, girocard, and QR-code payments are unsupported. Tap to Pay on Android is unsupported offline; Tap to Pay on iPhone offline is private preview in the United States [S3].
- Offline incremental authorization is unsupported. Tipping is supported on smart readers but not mobile or Tap to Pay readers. Offline card inspection is unavailable [S3].
- An offline PaymentIntent may have no Stripe ID until forwarded. The integration needs its own unique metadata identifier and must reconcile forwarding callbacks/webhooks [S1][S2].
- Stored payments forward automatically on reconnect. Do not power off/clear storage until the pending count is zero. Offline-created/confirmed intents cannot be canceled or refunded until forwarded [S1].
- Automatic capture occurs after successful forwarding; manual capture requires an online backend/app action after forward and authorization [S1].

#### Venue risk policy

| ID | Status | Requirement |
|---|---|---|
| OFF-PAY-001 | INFERRED | Default to online. Enter offline collection only after provider/WAN health fails and the UI explicitly labels the payment `PENDING AUTHORIZATION`. |
| OFF-PAY-002 | UNVERIFIED | Initial operational ceiling: USD 100 per offline card transaction, USD 1,000 pending per reader, USD 3,000 pending venue-wide, and 60 minutes maximum before manager reapproval. Owner/payment-risk approval is required before production; Stripe's USD 10,000 hard maximum must never become the default. |
| OFF-PAY-003 | INFERRED | The app must read SDK/reader pending count and amount by currency before every attempt. Reaching any limit switches card to `REQUIRE_ONLINE`; managers cannot bypass Stripe or venue hard ceilings. |
| OFF-PAY-004 | INFERRED | No keyed/card-not-present fallback, swipe, offline refund/cancel, incremental authorization, or unsupported scheme. Do not manually record card numbers. |
| OFF-PAY-005 | INFERRED | Use a unique local payment ID in Stripe metadata. Local status progression is `stored_offline → forwarding → authorized/captured | declined | forward_failed | manual_review`; never label `stored_offline` as paid. |
| OFF-PAY-006 | INFERRED | Admission on a pending offline card is a documented merchant-risk decision. A later decline creates a loss/receivable and incident item; it must not erase the historical order, admission, or ledger evidence. |
| OFF-PAY-007 | INFERRED | Reconnect opens a controlled drain: keep devices powered and app storage intact, forward all payments, reconcile callbacks plus webhooks by local ID, quarantine mismatches, and show a manager summary of accepted/declined/unresolved amounts. |
| OFF-PAY-008 | INFERRED | A daily readiness check verifies offline mode, reader/software recency, 24-hour smart-reader/30-day mobile prerequisites, battery, LAN path, SDK pending count zero, and a current configuration snapshot. |

### 5.4 Tickets and signed QR verification

Use a compact digital signature so authenticity can be checked without cloud access. A signature does not prove the ticket has not already been used; the local redemption registry provides that check.

Recommended token: compact JWS [S6] signed with Ed25519/EdDSA as standardized for JOSE [S7]. The protected header contains an allow-listed `alg`, `kid`, and ticket-token `typ`. Payload fields:

```text
v, ticket_id, venue_id, entitlement_type, session_id,
valid_from, valid_until, max_entries, issue_revision, nonce
```

No guest name, email, phone, waiver answer, price, or payment data belongs in the QR. The protected `kid` selects a cached public key; signing private keys remain cloud-side. Scanners pin a signed key set with overlap for rotation and a cached revoked-key list. If a non-JWS signed JSON form is chosen, canonicalize using RFC 8785 [S8].

Verification order:

1. Parse with strict size/type limits.
2. Select an allow-listed algorithm and `kid`; reject `alg=none` and algorithm substitution.
3. Verify the signature.
4. Verify venue, validity window, product/session, issue revision, and revocation/void cache.
5. In one edge transaction, lock `ticket_id`, enforce `max_entries`, append `CheckIn`, update local redemption count, audit, and enqueue outbox.
6. Return one of: `ADMIT`, `DENY`, `MANAGER_REVIEW`, never an ambiguous green screen.

Duplicate rules: a second scan on the connected LAN is denied atomically. Across disconnected islands, absolute double-entry prevention is impossible. Do not create islands; if unavoidable, preassign tickets/lane ranges or entry budgets and reconcile duplicates as incidents. First valid committed redemption wins for entitlement state; all attempts remain immutable.

### 5.5 Waivers

- Cache only approved, versioned waiver templates, required signer/guardian rules, and ticket/party linkage.
- A new offline waiver records template ID/hash/version, rendered content hash, signer-entered identity, guardian relationship where required, affirmative actions, operator/device, local/trusted timestamps, and an append-only evidence record. Do not claim a legal conclusion the software cannot establish.
- Existing waiver lookup may show only minimal status and expiry. Full documents/signatures are not broadly replicated to scanners.
- If the required template is missing/expired, guardian rules cannot be evaluated, or the clock is outside tolerance, do not improvise: use the approved paper process or deny electronic admission.
- Sync treats waivers as append-only evidence. Similar records may be linked for review but never silently collapsed or overwritten.

### 5.6 Capacity and inventory conflict controls

The cloud and edge must never sell from the same uncoordinated units.

- Before a session enters its outage-risk window, cloud allocates a signed, versioned `OfflineCapacityBudget(session_id, edge_id, units, expires_at)`. Cloud availability excludes those units; edge sales can consume only them.
- Unused units return only after the edge sends a final watermark and cloud acknowledges all prior edge events. Expiry alone does not make units safe to resell while an edge may still hold unsynchronized sales; recovery needs a manager-visible quarantine/settlement step.
- Edge uses one serializable transaction/row lock for sale/void/expiry against its grant. No manager may make capacity negative.
- General-admission walk-up products use the same grant model; uncapped products must be explicitly declared uncapped.
- Stock uses `OfflineStockBudget(sku, edge_id, quantity, expires_at)`. Edge stops at zero. Damages/comps are separate reasoned adjustments.
- Yellow Dog or another inventory master is not called during outage. Reconnection sends sales/adjustments idempotently and opens exceptions for rejected mappings or conflicting counts.
- If business chooses manager-authorized negative stock for non-safety-critical goods, it is a separate policy with a visible warning and audit; it never applies to capacity or safety limits.

## 6. Event, outbox, and synchronization protocol

### Local commit envelope

```text
event_id (UUIDv7/random), event_type, schema_version,
venue_id, edge_id, edge_epoch, edge_sequence,
aggregate_type, aggregate_id, aggregate_version,
occurred_at_local, last_trusted_time, actor_id, device_id,
correlation_id, causation_id, payload, previous_event_hash, event_hash
```

1. Domain mutation, ledger posting, audit entry, and outbox insert commit atomically.
2. Sender batches in `edge_sequence` order, uses mutual TLS/device identity, retries with backoff/jitter, and never deletes before cloud acknowledgement.
3. Cloud inbox uniquely constrains `event_id` and `(edge_id, edge_epoch, edge_sequence)`, stores payload hash, and returns highest contiguous acknowledged watermark plus gaps.
4. Cloud validates schema, venue/device grant, signature/MAC where used, aggregate invariant, capacity/stock grant, and idempotency.
5. Accepted events update cloud projections and create cloud outbox events atomically. Duplicate-identical events return success; duplicate ID with different bytes is a security incident.
6. Rejected business events go to a reconciliation queue without destroying local evidence. Permanent schema/authentication failures stop the lane and alert.
7. Cloud-to-edge configuration uses immutable versioned snapshots. Edge applies a snapshot atomically only after signature/hash and compatibility checks.

### Conflict rules

| Data | Authority/rule |
|---|---|
| Orders, cash facts, waivers, audit, scan attempts | Append; never last-write-wins |
| Edge-created IDs | Globally unique; cloud adopts or maps idempotently |
| Capacity/stock | Edge may consume only its grant; over-grant is quarantined, never silently accepted |
| Ticket redemption | Connected edge prevents duplicates; after partition, earliest valid committed use sets entitlement state and later uses become incidents, while all attempts remain |
| Offline card | Stripe forwarding result is authoritative for payment status; local order/admission history remains |
| Catalog/prices/tax/template | Cloud-authored immutable revision used at sale/signing; preserve sale-time/evidence snapshot |
| Guest profile edits | Disabled offline or queued as proposals; no field-level last-write-wins |
| Gift card/wallet/membership | Disabled offline unless cloud preallocates a cryptographically bounded allowance; default is no offline mutation |
| Inventory master | Local sale facts append; external-system rejection creates an exception and compensating adjustment, not event deletion |

## 7. Audit and observability

Each security/financial/operational entry records when, where, who, what, result, reason, interaction/correlation ID, device/app version, operating mode, cache revision, and time-confidence. OWASP specifically recommends these attributes and logging authentication, authorization, configuration, high-risk, data-access, startup/shutdown, and connectivity events [S4].

Requirements:

- Separate business journal, security log, and diagnostic log; link them by IDs.
- Redact tokens, secrets, PAN/CVC, full waiver content, and unnecessary PII.
- Make audit rows append-only and hash-chain them per edge epoch. Periodically anchor the latest hash to cloud; a hash chain detects later alteration but does not replace access control/backups.
- Log mode transitions, UPS events, cache/config changes, offline-limit decisions, every payment forward result, ticket allow/deny/review, manager overrides, failover/fencing, sync gaps, conflicts, and recovery sign-off.
- Apply strict write/read roles, storage quotas, protected rollover, alerting for log failure, and tests that logging failure cannot fill disk or bypass core controls.

## 8. Recovery objectives and runbooks

NIST defines RTO as how long recovery may take before mission impact and RPO as the point in time to which data must be recovered [S9][S10]. The following are design targets pending owner approval:

| Scenario | Proposed RTO | Proposed RPO | Notes |
|---|---:|---:|---|
| WAN outage, edge/LAN healthy | 2 minutes to enter degraded mode | 0 for locally acknowledged edge transactions | Cloud view may lag for outage duration |
| Utility outage, UPS healthy | 2 minutes to show UPS mode | 0 while edge commit succeeds | Required-lane runtime must be proven physically |
| Primary edge failure, standby healthy | 15 minutes manual fenced failover | ≤60 seconds | Requires warm replication and no dual-primary |
| Edge database corruption, hardware available | 60 minutes | ≤15 minutes | Requires tested encrypted local snapshot/WAL copies |
| Cloud returns after WAN outage | Forwarding starts ≤2 minutes; operational queue drained ≤30 minutes after stable service for normal volume | 0 accepted local events | Stripe/provider completion may take longer; unresolved items remain visible |
| Total loss of powered venue hardware | No software RTO is possible until power/hardware returns | Last durable replicated/backup point | Paper safety procedure is a business-continuity process, not software operation |

### Recovery gates

Normal mode reopens only after:

1. Utility/UPS/LAN/edge clocks and storage are healthy.
2. No split-brain/failover ambiguity exists.
3. Edge→cloud and cloud→edge sequence gaps are zero or explicitly quarantined.
4. Stripe offline pending count is zero or each remaining item has an assigned incident.
5. Capacity/stock grants reconcile.
6. Duplicate ticket, waiver, payment, and inventory exceptions are assigned.
7. Till and pending-payment totals are manager reviewed.
8. A signed recovery summary records who reopened normal operation and why.

### Drill schedule

- **Monthly:** disable WAN for 30 minutes during a controlled window; run one synthetic cash sale, one provider-approved test/simulated card flow, one ticket scan/duplicate scan, one waiver, and sync recovery.
- **Quarterly:** pull utility power to the test stack; measure runtime, load shedding, reserve shutdown, restart, and database integrity. Restore an encrypted backup to isolated hardware.
- **Semiannually:** primary-edge failure and manual fenced standby promotion; verify RPO/RTO and prevention of dual-primary writes.
- **Annually and after major provider/SDK/hardware changes:** full venue tabletop plus technical exercise, offline-payment policy review, key rotation/revocation test, and staff retraining.

Never perform a live payment that creates real financial movement in a drill unless separately approved and reconciled.

## 9. Safe degraded-mode UX

- Persistent top banner and lane light: `ONLINE`, `OFFLINE—LOCAL ONLY`, `POWER ON UPS`, `SYNCING`, or `STOPPED`; include start time and last successful sync.
- Tender buttons explain consequences before selection: `Card — authorization delayed; limits apply`, `Cash — available`, `Gift card — unavailable offline`.
- Use exact verbs: `Stored for authorization`, not `Approved`; `Queued`, not `Sent`; `Signature valid`, not `Ticket unused`, until local redemption checks pass.
- Disable unavailable controls rather than allowing a late generic error. Explain the safe alternative in one sentence.
- Require a manager reason for any exception. Never hide risk ceilings behind an override dialog when the action is prohibited.
- Keep an accessible, keyboard/touch-friendly workflow; do not convey state only through color, sound, or tiny icons.
- Show one recovery queue with counts and amounts: unsent events, pending/declined cards, duplicate scans, capacity/stock conflicts, and stale-cache items.

## 10. Acceptance tests

### Power and network

1. **AT-OFF-001 — WAN loss:** Given all devices are online and cache is current, when WAN is disconnected, then every required lane enters `WAN_DEGRADED` within 120 seconds, local cash/ticket operations continue, and cloud-only actions are disabled.
2. **AT-OFF-002 — total power:** Given no UPS/battery power, when utility power is removed, then electronic functions stop; documentation/UI make no claim that software continues, and the paper/closure runbook is invoked.
3. **AT-OFF-003 — UPS reserve:** Given UPS mode, when reserve threshold is reached, then new offline cards stop, the outbox/database checkpoint completes, the UI enters `SAFE_STOP`, and shutdown is clean.
4. **AT-OFF-004 — LAN dependency:** Given a smart reader and separate POS, when WAN fails but LAN remains, then collection can follow supported offline flow; when LAN also fails, the app does not claim the smart reader is usable.
5. **AT-OFF-005 — split brain:** Given primary and standby cannot see each other, when failover is requested, then only a manager can fence/promote; simultaneous writes on both nodes are rejected/detected.

### POS, cash, and card

6. **AT-OFF-006 — atomic cash sale:** Given one remaining capacity unit, when an offline cash sale commits, then order, tender, capacity, journal, audit, and outbox exist together; forced crash at each write boundary leaves either all or none.
7. **AT-OFF-007 — card wording:** Given no internet, when a card is collected, then the receipt/UI say pending authorization and never approved/paid until Stripe returns success.
8. **AT-OFF-008 — risk ceiling:** Given the next card exceeds any per-transaction/reader/venue/time ceiling, when checkout begins, then Terminal is configured `REQUIRE_ONLINE`, card is disabled, and no manager bypass exists.
9. **AT-OFF-009 — unsupported payment:** Given offline mode, when swipe/keyed/unsupported scheme/refund/cancel/incremental authorization is requested, then the action is blocked before customer completion and audited.
10. **AT-OFF-010 — storage protection:** Given unforwarded mobile-reader SDK payments, when app reinstall/cache clear is attempted, then operational controls block the action and show pending count. After count reaches zero, maintenance may proceed.
11. **AT-OFF-011 — late decline:** Given admission was granted against an offline card, when forwarding later declines, then payment becomes `declined`, an exception/loss record opens, and order/admission/audit history remains immutable.
12. **AT-OFF-012 — idempotent forward:** Given the same forwarding callback and webhook arrive repeatedly/out of order, when processed, then exactly one canonical payment transition/journal effect occurs.

### Ticket and waiver

13. **AT-OFF-013 — signed ticket:** Given a valid cached public key and unused in-window ticket, when scanned offline, then signature and claims validate and one atomic `ADMIT` check-in is written.
14. **AT-OFF-014 — tamper/key failure:** Given one payload byte is changed, `alg` is unapproved, `kid` is unknown/revoked, or venue/time is wrong, when scanned, then entry is denied or manager-reviewed according to policy and no redemption is consumed.
15. **AT-OFF-015 — duplicate:** Given a ticket has been admitted on the connected LAN, when any connected scanner rescans it, then the second scan is denied and both attempts are audited.
16. **AT-OFF-016 — isolated scanner:** Given a scanner cannot reach edge, when it verifies a genuine QR, then the UI says authenticity-only/usage-unknown and cannot consume shared capacity unless it has a distinct preallocated lane budget.
17. **AT-OFF-017 — waiver evidence:** Given a current cached waiver template, when signed offline, then template version/hash, consent actions, signer/guardian facts, device/operator, and time confidence persist atomically and later sync without overwrite.
18. **AT-OFF-018 — stale waiver:** Given the template is absent/expired or clock skew exceeds tolerance, when waiver capture is attempted, then electronic capture fails safely and offers only the approved paper/deny route.

### Capacity, inventory, and sync

19. **AT-OFF-019 — capacity partition:** Given cloud total 100 and edge grant 10, when cloud sells 90 and edge attempts 11, then the first 10 may commit and the 11th is rejected; combined confirmed sales never exceed 100.
20. **AT-OFF-020 — grant return:** Given an outage ends with unused units, when edge events are not fully acknowledged, then cloud cannot resell those units. Only after contiguous watermark/reconciliation may they return.
21. **AT-OFF-021 — stock floor:** Given offline stock grant is zero, when another sale is attempted, then it is blocked unless a separately approved non-safety negative-stock policy applies; capacity can never use that exception.
22. **AT-OFF-022 — duplicate event:** Given an event is resent unchanged, when cloud receives it, then it returns success without duplicate effects. Same `event_id` with different bytes is rejected and alerted as a security incident.
23. **AT-OFF-023 — gap:** Given sequences 41 and 43 arrive, when cloud processes them, then 43 remains pending/quarantined until 42 arrives or a documented recovery resolves the gap.
24. **AT-OFF-024 — price conflict:** Given cloud edits a price during outage, when an edge sale uses cached revision, then its immutable sale-time snapshot remains; sync does not reprice the sale.
25. **AT-OFF-025 — recovery gate:** Given one pending Stripe item or unresolved sequence gap remains, when an operator requests normal mode, then the system blocks full recovery or records an explicit manager-owned incident under policy; it never silently declares clean recovery.

### Security and recovery

26. **AT-OFF-026 — stolen disk and tamper:** Given storage media is removed, when examined without device/key authorization, then cached PII and database contents are unreadable. Independently changing ciphertext, tag, nonce, or associated record/schema data makes decryption fail without returning plaintext; nonce-reuse tests detect any repeat under one key.
27. **AT-OFF-027 — expired grant:** Given an offline staff grant is expired/revoked in the newest cache, when used, then login/high-risk action is denied and audited.
28. **AT-OFF-028 — log safety:** Given logging destination is full/unavailable, when operations continue, then secrets/PII are not exposed, the condition alerts, and high-risk writes fail closed without corrupting the business transaction.
29. **AT-OFF-029 — restore:** Given the latest encrypted backup and WAL set, when restored in the quarterly drill, then integrity checks pass and measured RPO/RTO meet the target.
30. **AT-OFF-030 — drill evidence:** Given a scheduled exercise, when complete, then actual runtime, RPO/RTO, failures, owners, remediation dates, and manager sign-off are retained in the audit system.

## 11. Implementation sequence

1. Build local read-only ticket/waiver cache and signed-QR verification.
2. Add atomic local check-in and outbox/inbox sync.
3. Add offline capacity grants and cash-only POS.
4. Add stock grants and external inventory reconciliation.
5. Add Stripe Terminal online card-present flow.
6. Add Stripe offline collection only after hardware selection, supported SDK/reader validation, risk approval, drills, and decline/reconciliation reporting.
7. Add warm standby and measured UPS shutdown/failover drills before claiming the stated RPO/RTO.

Do not launch offline card acceptance merely because a demo transaction works. Hardware recency, loss policy, aggregate ceilings, store-and-forward recovery, staff training, and accounting treatment must all pass acceptance.

## Sources

- **[S1] Stripe — Collect card payments while offline (mobile/iOS variant):** https://docs.stripe.com/terminal/features/operate-offline/collect-card-payments.md?terminal-card-present-integration=terminal&reader-type=bluetooth&terminal-sdk-platform=ios
- **[S2] Stripe — Collect card payments while offline (smart reader/Android variant):** https://docs.stripe.com/terminal/features/operate-offline/collect-card-payments.md?terminal-card-present-integration=terminal&reader-type=internet&terminal-sdk-platform=android
- **[S3] Stripe — Accept offline payments: availability, payment methods, readers, and features:** https://docs.stripe.com/terminal/features/operate-offline/overview.md?reader-type=bluetooth
- **[S4] OWASP — Logging Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- **[S5] OWASP — Cryptographic Storage Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- **[S6] IETF RFC 7515 — JSON Web Signature:** https://www.rfc-editor.org/rfc/rfc7515.html
- **[S7] IETF RFC 8037 — Ed25519/EdDSA for JOSE:** https://www.rfc-editor.org/rfc/rfc8037.html
- **[S8] RFC 8785 — JSON Canonicalization Scheme:** https://www.rfc-editor.org/rfc/rfc8785.html
- **[S9] NIST SP 800-34 Rev. 1 — Contingency Planning Guide:** https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final
- **[S10] NIST — RTO and RPO glossary definitions:** https://csrc.nist.gov/glossary/term/recovery_time_objective and https://csrc.nist.gov/glossary/term/recovery_point_objective
- **[S11] NIST SP 800-92 — Guide to Computer Security Log Management:** https://csrc.nist.gov/pubs/sp/800/92/final
- **[S12] NIST SP 800-38D — Galois/Counter Mode (GCM) and GMAC:** https://csrc.nist.gov/pubs/sp/800/38/d/final
- **[S13] NIST SP 800-111 — Storage Encryption Technologies for End User Devices:** https://www.nist.gov/publications/guide-storage-encryption-technologies-end-user-devices
- **[S14] NIST SP 800-57 Part 1 Rev. 5 — Recommendation for Key Management:** https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final

**Source check date:** 2026-09-18. Stripe capabilities are product-specific and can change; pin the selected SDK/reader versions and recheck official documentation before procurement and each production upgrade.
