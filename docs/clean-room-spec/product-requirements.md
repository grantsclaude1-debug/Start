# Product Requirements and Non-Goals

[Back to index](README.md) · [Labels](terminology-and-evidence.md#status-labels) · [Owner questions](unknowns-and-owner-questions.md#owner-question-register)

Every material product assertion is one labeled row.

## Functional requirements

| ID | Status | Requirement | Provenance |
|---|---|---|---|
| PR-001 | CONFIRMED | Support catalog definitions, schedules, price rules, categories, discounts, resources, stock, and multiple sales channels. | A |
| PR-002 | CONFIRMED | Support timed/general admission, recurring access, group packages, bundles, gift cards, memberships, stock items, and wallet-like stored value. | A |
| PR-003 | CONFIRMED | Provide booking list, calendar, run-sheet, daily-capacity, capacity-block, and transaction capabilities. | A |
| PR-004 | INFERRED | Reserve Session capacity atomically through expiring `ReservationHold` records before payment. | DESIGN; M |
| PR-005 | INFERRED | Prevent oversell under concurrent hold, expiry, confirmation, cancellation, block, and migration operations. | DESIGN |
| PR-006 | CONFIRMED | Support online, assisted, POS, kiosk, payment-link/invoice, gift-card, and recurring-membership payment contexts. | A; P |
| PR-007 | INFERRED | Keep `Order`, payment, capacity, and fulfillment state separate. | DESIGN; P |
| PR-008 | INFERRED | Issue scannable `Ticket` entitlements only after the configured fulfillment gate and append every `CheckIn` attempt. | DESIGN; M |
| PR-009 | CONFIRMED | Support full/partial refunds, reasons, controlled approval, gift-card refunds, and dispute evidence workflows. | A; P |
| PR-010 | INFERRED | Maintain immutable double-entry `Journal` entries and provider/payout/bank reconciliation. | DESIGN; P |
| PR-011 | INFERRED | Maintain GiftCard value through append-only `StoredValueEntry` records with atomic mixed-tender reservation and reversal. | DESIGN; P |
| PR-012 | CONFIRMED | Support fixed and recurring memberships, saved-payment collection, dunning, suspension/reactivation, and benefits. | P |
| PR-013 | INFERRED | Keep `MembershipContract` contract, billing, and entitlement states distinct. | DESIGN; P |
| PR-014 | CONFIRMED | Provide staff/roles, MFA administration, reports, notifications, devices, integrations, and API/webhook surfaces. | A |
| PR-015 | INFERRED | Store waiver/consent evidence as versioned documents or references linked to fulfillment, excluding signatures from events. | DESIGN; M |
| PR-016 | INFERRED | Provide auditable exports/API feeds before any automated accounting posting. | DESIGN; P |
| PR-017 | UNVERIFIED | Initial release scope and channel priority follow an owner-approved MVP boundary. | OQ-002 |
| PR-018 | UNVERIFIED | Initial tenant, venue, legal-merchant, and Stripe Connect topology follow the approved legal/funds-flow decision. | OQ-003 |
| PR-019 | UNVERIFIED | Card-present Terminal and offline operation are included only within approved regional, hardware, risk, and continuity limits. | OQ-004 |
| PR-020 | UNVERIFIED | GiftCard scope, currency, expiry, cash redemption, transfer, breakage, and unclaimed-property treatment follow approved policy. | OQ-005 |
| PR-021 | UNVERIFIED | Refund allocation and membership billing/entitlement rules follow published owner-approved policies. | OQ-006; OQ-007 |
| PR-022 | UNVERIFIED | Migration includes only approved, available, lawful source classes and records explicit completeness exceptions. | OQ-008 |

## Quality requirements

| ID | Status | Requirement | Provenance |
|---|---|---|---|
| QR-001 | INFERRED | Enforce Tenant isolation in authorization and PostgreSQL row-level security; jobs carry explicit trusted Tenant context. | DESIGN; M |
| QR-002 | INFERRED | Retried writes are idempotent; aggregate transitions use optimistic versions or deterministic row locks. | DESIGN; P |
| QR-003 | INFERRED | Financial, security, permission, check-in, migration, and administrative changes produce immutable audit evidence. | DESIGN |
| QR-004 | INFERRED | Provider callbacks are authenticated, durable, deduplicated, order-independent, retried, dead-lettered, and replayable. | DESIGN; P |
| QR-005 | INFERRED | Raw PAN/CVC never reaches platform servers; hosted/tokenized collection minimizes PCI scope. | DESIGN; P |
| QR-006 | INFERRED | Capacity commits, money, stored value, and final ticket redemption are strongly consistent. | DESIGN |
| QR-007 | UNVERIFIED | Availability, RTO, RPO, peak load, and support objectives use approved numeric targets. | OQ-009 |
| QR-008 | UNVERIFIED | Retention, deletion, legal hold, privacy, residency, and accessibility rules use approved jurisdictional policy. | OQ-010 |
| QR-009 | UNVERIFIED | Currencies, countries, languages, tax treatment, and payment methods are approved before build commitment. | OQ-011 |
| QR-010 | UNVERIFIED | Chart of accounts and posting/revenue/tax/deposit/dispute/breakage rules receive accounting approval. | OQ-012 |
| QR-011 | UNVERIFIED | Payment-provider features, methods, Terminal capabilities, and fallback behavior are contractually confirmed before integration commitment. | OQ-014 |

## Explicit non-goals

| ID | Status | Non-goal | Provenance |
|---|---|---|---|
| NG-001 | INFERRED | Pixel-level cloning, copied wording/navigation, brand imitation, or proprietary assets. | Clean-room constraint |
| NG-002 | INFERRED | Importing private records, secrets, exports, or reverse-engineered schemas into specification/source control. | Clean-room constraint |
| NG-003 | INFERRED | Building a processor, acquirer, bank, card network, identity-verification service, or general-purpose wallet. | P |
| NG-004 | INFERRED | Treating provider dashboards or webhook delivery as the accounting system of record. | P |
| NG-005 | INFERRED | Marketplace payout routing unless approved legal sellers and funds flow require it. | P |
| NG-006 | INFERRED | Generalized CRM, BI, workflow automation, or broad partner marketplace in the core booking slice. | M |
| NG-007 | INFERRED | Providing tax, accounting, stored-value, or legal advice. | P |
