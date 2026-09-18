# Terminology, Evidence, and Clean-Room Constraints

[Back to index](README.md)

## Status labels

| Label | Meaning | Implementation use |
|---|---|---|
| **CONFIRMED** | Directly observed in the read-only audit or supported by cited public documentation. | A capability requirement may be accepted, but observed implementation details are not copied. |
| **INFERRED** | Independent design required to satisfy confirmed capability, security, reliability, or accounting needs. | Implement as specified unless an owner decision supersedes it. |
| **UNVERIFIED** | Depends on an owner, legal, accounting, market, jurisdiction, or operational decision. | Do not hard-code; every owner-driven assumption cites an `OQ-###`. |

Delivery states such as `planned`, `implemented`, and `accepted` are separate from evidence labels.

## Canonical terms

| Term | Definition |
|---|---|
| Tenant | Security and data-isolation boundary for one operating organization. |
| Venue | Physical or virtual operating location within a Tenant. |
| Product | Sellable definition; immutable sale-time details are copied to `OrderLine`. |
| Session | Time-bounded availability instance for a Product. |
| ReservationHold | Temporary capacity claim with an expiry. |
| Order | Versioned commercial agreement and receivable. |
| Ticket | Fulfillment entitlement issued from a confirmed Order. |
| CheckIn | Append-only admission attempt/result for one Ticket. |
| Payment | Aggregate amount requested for an Order or Invoice. |
| PaymentAttempt | One provider/channel collection attempt. |
| Refund | Reversal of captured tender, never a negative PaymentAttempt. |
| Dispute | External challenge against a captured PaymentAttempt. |
| GiftCard | Closed-loop stored-value instrument. |
| StoredValueEntry | Append-only GiftCard authorization, capture, release, credit, debit, expiry, or adjustment. |
| MembershipContract | Commercial membership agreement; distinct from entitlement and billing state. |
| Journal | Immutable balanced accounting event containing Postings. |
| OutboxEvent | Durable internal event awaiting publication. |
| ExportJob | Audited asynchronous generation of a short-lived report artifact. |
| OfflineManifest | Signed, time-bounded device snapshot of admission/policy data for degraded operation. |
| OfflineCapacityBudget | Non-overlapping Session capacity allocation a registered edge/device may consume while disconnected. |
| OfflineStockBudget | Non-overlapping SKU quantity allocation a registered edge/device may consume while disconnected. |
| OfflineCommand | Edge/device-signed append-only sale/check-in fact awaiting canonical server resolution. |
| IntegrationConnection | Disabled/enabled versioned adapter configuration with secret reference, mappings, checkpoint, and health. |

Canonical status and event names appear in the lifecycle documents and [event catalog](interfaces-and-security.md#event-catalog).

## Authoritative inputs

- **CONFIRMED — observed behavior source:** a separately retained read-only account audit, inspected without mutations, exports, screenshots, private records, or secrets; the account-specific report is intentionally excluded from this prototype repository.
- **CONFIRMED — public research source:** a separately retained payment-ecosystem and clean-room architecture report based on public product/provider documentation.
- **CONFIRMED — project decision source:** the private project record containing approved direction, constraints, and unresolved decisions; private workspace memory is intentionally excluded.
- **CONFIRMED — public Yellow Dog source synthesis:** a separately retained clean-room adapter contract based only on official public Yellow Dog product, help-center, and developer documentation; account-specific credentials, permissions, modules, and certification remain unknown.

Source documents are evidence, not specifications. Account-specific names, amounts, rates, settings, records, routes, and UI wording are deliberately excluded.

## Clean-room rules

- **INFERRED — constraint:** Reproduce independently specified capabilities and workflows only; do not copy source code, private schemas, internal APIs, branding, UI text/layout, proprietary assets, or private data.
- **INFERRED — constraint:** Do not infer an internal implementation from observed screens. Every architecture rule in this package is an independent design.
- **INFERRED — constraint:** Use public standards/provider contracts at implementation time, pin their versions, and record citations in architecture decision records.
- **INFERRED — constraint:** Synthetic fixtures only; no customer, staff, booking, transaction, credential, endpoint-secret, or venue-specific production data may enter source control.
- **CONFIRMED — owner decision:** The initial operating scope is the approved single launch venue only, with ticket sales first, owner/managers as primary users, one merchant, no initial Stripe Connect, bounded offline continuity, simple downloadable reports, read-only ROLLER migration, Yellow Dog inventory planning, and use of the existing GitHub repository. The initial private build uses one temporary shared passcode gate; Resend, passkeys, TOTP, MFA, recovery, and individual accounts are postponed to a future decision.
- **UNVERIFIED — owner decision (OQ-001):** Product name, brand identity, and public-facing terminology are intentionally unspecified.

## Provenance notation

Requirements cite `A` (read-only audit), `P` (payment architecture/public research), `M` (project record), or `YD` (official-public-source Yellow Dog adapter contract). `DESIGN` denotes independent engineering judgment. `OQ-###` denotes an owner decision in [the register](unknowns-and-owner-questions.md#owner-question-register).
