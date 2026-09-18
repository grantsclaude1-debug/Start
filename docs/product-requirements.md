# Product Requirements and Non-Goals

[Back to index](README.md) · [Labels](terminology-and-evidence.md#status-labels) · [Owner questions](unknowns-and-owner-questions.md#owner-question-register)

Each row is one material assertion and includes its evidence status and provenance.

## Functional requirements

| ID | Status | Requirement | Provenance |
|---|---|---|---|
| PR-001 | CONFIRMED | Support product/catalog definitions, schedules, price rules, categories, discounts, resources, stock, and multiple sales channels. | A |
| PR-002 | CONFIRMED | Support timed and general admission, recurring access, group packages, bundles, gift cards, memberships, stock items, and prepaid wallet-like value. | A |
| PR-003 | CONFIRMED | Provide booking list, calendar, run-sheet, daily-capacity, capacity-block, and transaction views. | A |
| PR-004 | INFERRED | Reserve Session capacity atomically through expiring `ReservationHold` records before payment. | DESIGN; M |
| PR-005 | INFERRED | Never oversell a capacity pool under concurrent hold, expiry, confirmation, cancellation, or migration activity. | DESIGN |
| PR-006 | CONFIRMED | Support online, assisted, POS, kiosk, payment-link/invoice, gift-card, and recurring-membership payment contexts. | A; P |
| PR-007 | INFERRED | Represent an `Order` independently from payment, fulfillment, and provider state. | DESIGN; P |
| PR-008 | INFERRED | Issue scannable `Ticket` entitlements only after the configured fulfillment gate and record each `CheckIn` attempt. | DESIGN; M |
| PR-009 | CONFIRMED | Support full and partial refunds, refund reasons, controlled approval, gift-card refunds, and dispute evidence workflows. | A; P |
| PR-010 | INFERRED | Maintain an immutable double-entry `Journal` and daily provider/payout/bank reconciliation. | DESIGN; P |
| PR-011 | INFERRED | Maintain GiftCard value in append-only `StoredValueEntry` records with atomic mixed-tender reservation and reversal. | DESIGN; P |
| PR-012 | CONFIRMED | Support fixed and recurring memberships, saved-payment collection, dunning, suspension/reactivation, and benefit access. | P |
| PR-013 | INFERRED | Keep `MembershipContract` billing state separate from entitlement state and apply an explicit policy between them. | DESIGN; P |
| PR-014 | CONFIRMED | Model staff roles and permissions for the product, while the initial private build uses only a shared temporary passcode gate and does not claim individual role authentication. | A; M |
| PR-015 | INFERRED | Record waivers and consent evidence as versioned external or internal documents linked to fulfillment, without placing signatures in event payloads. | DESIGN; M |
| PR-016 | INFERRED | Provide auditable exports/API feeds before automated accounting posting. | DESIGN; P |
| PR-017 | CONFIRMED | Launch for one approved active Venue; ticket sales are the highest product priority. | M; owner decision 2026-09-18 |
| PR-018 | UNVERIFIED | Card-present Terminal is in the first production release. | OQ-003 |
| PR-019 | CONFIRMED | Support bounded offline ticket selling and check-in during internet or power disruption, subject to explicit device-battery, UPS, capacity-budget, payment-risk, and synchronization limits. | M |
| PR-020 | CONFIRMED | The launch venue is the only initial payment-collecting merchant; do not use Stripe Connect initially. | M |
| PR-021 | UNVERIFIED | Gift cards are single-Tenant, single-currency, closed-loop instruments. | P; OQ-007 |
| PR-022 | CONFIRMED | Initial funds flow is single-merchant, not marketplace routing; merchant/seller/tax treatment still requires professional confirmation. | M |
| PR-023 | INFERRED | Tenant self-service creation, multi-venue administration, marketplace payouts, and custom-domain white labeling are not initial-release requirements. | M |
| PR-024 | CONFIRMED | Give owners and VenueManagers the primary administrative experience; other roles are narrower operational or financial views. | M |
| PR-025 | CONFIRMED | Provide simple plain-language reports with an easy, permission-controlled download action and visible definitions/freshness. | M |
| PR-026 | CONFIRMED | Migrate every ROLLER data class made available through an approved read-only mechanism, preserving provenance and reconciliation while never writing back to ROLLER. | M |
| PR-027 | CONFIRMED | Design disabled-by-default adapters for every observed external integration, including Yellow Dog as the current inventory system. | M |
| PR-028 | CONFIRMED | Postpone Resend, email verification/OTP, passkeys, TOTP, MFA, invitations, recovery, and individual-account authentication until a later owner-approved phase. | M |
| PR-029 | INFERRED | Run reports/exports asynchronously from governed read models so reporting cannot block checkout or check-in. | DESIGN; M |
| PR-030 | CONFIRMED | Keep Yellow Dog authoritative for item, inventory, recipe, vendor, purchasing, receipt, count, waste, transfer, and on-hand facts; launch a read-only local mirror and keep checkout/admission independent of Yellow Dog availability. | M; YD |
| PR-031 | UNVERIFIED | The complete first-production-release capability boundary is owner-approved before build commitment. | OQ-002 |
| PR-032 | UNVERIFIED | Self-service Tenant creation, white-label branding, and custom domains follow an approved launch decision. | OQ-009 |
| PR-033 | UNVERIFIED | Advanced CRM, BI, workflow automation, partner marketplace, and multi-party payouts follow an approved include/defer decision. | OQ-013 |
| PR-034 | UNVERIFIED | ROLLER migration uses an approved inventory of available read-only data classes, extraction methods, history, quality, controls, and cutover window. | OQ-025 |
| PR-035 | CONFIRMED | Provide a disabled-by-default clean-room venue-audio adapter for the owner-requested Splash Radio service without making ticketing, check-in, payments, or life safety depend on it. | M |
| PR-036 | UNVERIFIED | Production Splash Radio connection uses the confirmed vendor/product, contract, licensing, authentication, capability, hardware, and rate-limit matrix. | OQ-027 |
| PR-037 | CONFIRMED | Gate the initial private build with one deployment-configured shared passcode whose plaintext is never hard-coded or committed; store only a versioned salted verifier/secret reference, rate-limit attempts, and label the gate temporary/non-production. | M |
| PR-038 | CONFIRMED | After Yellow Dog certification and credentials, submit finalized sales, returns, voids, and corrections asynchronously with stable transaction/line IDs, idempotent retry, acknowledgement retrieval, and daily reconciliation. | YD |
| PR-039 | CONFIRMED | Enforce Yellow Dog capability flags and the documented public API ceiling of 2 requests/second per user, honoring `Retry-After`; item/vendor/purchase-order/receipt/count/waste/recipe/transfer writes remain disabled until individually documented, permitted, tested, and certified. | YD |

## Quality requirements

| ID | Status | Requirement | Provenance |
|---|---|---|---|
| QR-001 | INFERRED | Enforce Tenant isolation in application authorization and PostgreSQL row-level security; background jobs carry explicit Tenant context. | DESIGN; M |
| QR-002 | INFERRED | All externally retried writes are idempotent; all aggregate transitions use optimistic version checks or row locks. | DESIGN; P |
| QR-003 | INFERRED | Financial, security, permission, check-in, and administrative changes produce immutable audit records. | DESIGN |
| QR-004 | INFERRED | Provider callbacks are authenticated, durable, deduplicated, order-independent, retried, and replayable. | DESIGN; P |
| QR-005 | INFERRED | Raw card data never reaches platform servers; hosted/tokenized provider components minimize PCI scope. | DESIGN; P |
| QR-006 | INFERRED | Availability reads may be eventually consistent, but capacity commits, money, stored value, and ticket redemption are strongly consistent. | DESIGN |
| QR-007 | UNVERIFIED | Production availability, recovery-time, and recovery-point objectives use values selected by the owner. | OQ-010 |
| QR-008 | UNVERIFIED | Data-retention and deletion periods use jurisdiction- and contract-approved values. | OQ-011 |
| QR-009 | UNVERIFIED | Supported countries, languages, accessibility target, currencies, and payment methods are owner-approved before build commitment. | OQ-006; OQ-012 |
| QR-010 | INFERRED | Offline commands are device-signed, sequenced, encrypted locally, idempotent on sync, capacity-bounded, and visibly reconciled; no degraded mode stores raw card data. | DESIGN |
| QR-011 | INFERRED | Export artifacts are encrypted, short-lived, access-controlled, audited, and generated outside request threads. | DESIGN |
| QR-012 | INFERRED | The temporary gate fails closed on missing/invalid verifier, limiter outage, or session-store failure; it logs no submitted passcode and grants no individual identity, role assurance, MFA, approval, or production capability. | DESIGN; M |
| QR-013 | UNVERIFIED | Chart of accounts and posting, revenue, tax, deposit, dispute, and breakage policies are approved before financial implementation. | OQ-017 |
| QR-014 | UNVERIFIED | Performance architecture is sized against an owner-approved peak workload envelope. | OQ-018 |
| QR-015 | UNVERIFIED | Migration scope, source quality, cutover window, and rollback limits are approved before production-data work. | OQ-019 |
| QR-016 | UNVERIFIED | Initial provider capabilities, payment methods, and fallback strategy are contractually confirmed before integration commitment. | OQ-020 |

## Explicit non-goals

| ID | Status | Non-goal | Provenance |
|---|---|---|---|
| NG-001 | INFERRED | Pixel-level cloning, copied wording/navigation, brand imitation, or use of proprietary assets. | Clean-room constraint |
| NG-002 | INFERRED | Importing private records, secrets, exports, or reverse-engineered internal schemas. | Clean-room constraint |
| NG-003 | INFERRED | Building a card processor, acquirer, bank, network, identity-verification service, or general-purpose wallet. | P |
| NG-004 | INFERRED | Treating provider dashboards or webhook delivery as the accounting system of record. | P |
| NG-005 | INFERRED | Marketplace/Connect funds routing until legal sellers, liability, and payouts require it. | P |
| NG-006 | CONFIRMED | Advanced CRM automation, generalized BI, multi-party payouts, broad partner marketplace, and replacement of the external software inventory are deferred until the later inventory review. | M |
| NG-007 | INFERRED | Tax, accounting, stored-value, or legal policy advice; approved professionals must define those policies. | P |
| NG-008 | CONFIRMED | Multi-venue operations and Stripe Connect are excluded from the initial single-venue release. | M |
