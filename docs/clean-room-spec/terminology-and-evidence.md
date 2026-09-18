# Terminology, Evidence, and Clean-Room Constraints

[Back to index](README.md)

## Status labels

| Label | Meaning | Implementation treatment |
|---|---|---|
| **CONFIRMED** | Directly observed in the read-only audit or supported by the supplied public-research report/project record. | Accept the capability claim, not any proprietary implementation detail. |
| **INFERRED** | Independent design needed for correctness, reliability, security, or accounting. | Implement unless a later approved decision supersedes it. |
| **UNVERIFIED** | Depends on an unanswered owner, legal, accounting, jurisdictional, commercial, or operational decision. | Do not hard-code; cite an `OQ-###`. |

Labels express evidence confidence, not delivery status.

## Canonical terms

`Tenant` is the security/isolation boundary; `Venue` is an operating location; `Product` is a sellable definition; `Session` is time-bounded availability; `ReservationHold` is an expiring capacity claim; `Order` is the commercial agreement; `Ticket` is an admission entitlement; `CheckIn` is an append-only admission attempt; `Payment` is the payable aggregate; `PaymentAttempt` is one collection attempt; `Refund` reverses captured tender; `Dispute` is an external challenge; `GiftCard` is closed-loop stored value; `StoredValueEntry` is an append-only value movement; `MembershipContract` is the commercial membership agreement; `Journal` is an immutable balanced accounting event; `OutboxEvent` is a durable event awaiting publication.

Canonical status names and events are defined in the lifecycle and interface documents.

## Authoritative inputs

- **CONFIRMED — observed behavior:** separately retained read-only audit; account-specific details are intentionally excluded from this prototype repository.
- **CONFIRMED — public research:** separately retained payment-ecosystem and clean-room architecture research.
- **CONFIRMED — project record:** private project decisions and constraints retained outside this prototype repository.

Requirements use provenance codes `A`, `P`, `M`, and `DESIGN`. Source documents are evidence, not specifications.

## Clean-room rules

- Reproduce capabilities and business outcomes only; never copy ROLLER code, schemas, branding, UI text/layout, routes, proprietary assets, or private records.
- Do not infer internal implementation from observed screens.
- Use synthetic fixtures only; keep customer, staff, booking, payment, credential, secret, and account-specific data out of source control.
- Keep account-specific names, fee/tax figures, settings, and operational records out of this package.
- Provider and standards contracts must be revalidated and version-pinned during implementation.
- Product name and public terminology remain **UNVERIFIED (OQ-001)**.
