# Clean-Room Venue Platform Specification

Implementation-ready specification index for an independently designed, single-venue venue-management platform for the launch venue. The data model preserves explicit Tenant and Venue boundaries for safety, but launch scope is one active Venue and one payment-collecting merchant.

## Status vocabulary

Every material product requirement is labeled **CONFIRMED**, **INFERRED**, or **UNVERIFIED** as defined in [Terminology and evidence](terminology-and-evidence.md). Labels describe evidence confidence, not delivery status.

## Document map

1. [Terminology, evidence, provenance, and clean-room constraints](terminology-and-evidence.md)
2. [Product requirements and non-goals](product-requirements.md)
3. [Modules, roles, and permissions](modules-and-permissions.md)
4. [Authentication and account-security contract](authentication-contract.md)
5. [Entity and data model](data-model.md)
6. [Booking, order, ticket, and check-in lifecycles](commerce-lifecycles.md)
7. [Payments, ledger, refunds, disputes, stored value, and memberships](finance-lifecycles.md)
8. [Events, webhooks, API, and security boundaries](interfaces-and-security.md)
9. [Venue operations, reporting, offline mode, authentication, and integrations](operations-integrations-and-reporting.md)
10. [Detailed offline venue operations architecture](offline-operations.md)
11. [Splash Radio venue-audio adapter](splash-radio-adapter.md)
12. [Testing, migration, parallel run, and roadmap](delivery-plan.md)
13. [Cross-document invariants](invariants.md)
14. [Highest-risk unknowns and owner questions](unknowns-and-owner-questions.md)
15. [Local validation utility](validate.py)

## Canonical implementation stance

- **CONFIRMED — owner decision:** Launch for the approved single venue as one active Venue and one merchant; ticket sales are the top priority, owners/managers are the primary target users, and Stripe Connect is excluded initially.
- **CONFIRMED — owner decision:** The initial private build uses one temporary shared passcode gate configured only as a salted verifier/secret reference. It is not production authentication; Resend, passkeys, TOTP, MFA, recovery, and individual accounts are postponed.
- **INFERRED — independent design:** Implement a provider-neutral modular monolith backed by PostgreSQL, with asynchronous workers for external calls and reconciliation; split services only where measured scale, isolation, or compliance requires it.
- **INFERRED — independent design:** Keep browser-hosted payment collection and provider tokens outside the core domain; Stripe is the initial adapter, not the domain model.
- **CONFIRMED — official-public-source Yellow Dog contract:** Yellow Dog remains inventory authority. Launch with a read-only local mirror plus certified asynchronous/idempotent sales submission under the documented 2 requests/second per-user ceiling; all purchasing/receipt/count/waste/recipe/vendor/item and other non-sales writes remain disabled until individually documented and certified.
- **INFERRED — independent design:** Treat `Tenant`, `Venue`, `Product`, `Session`, `ReservationHold`, `Order`, `Ticket`, `CheckIn`, `Payment`, `PaymentAttempt`, `Refund`, `Dispute`, `GiftCard`, `StoredValueEntry`, `MembershipContract`, `Journal`, `OutboxEvent`, `ExportJob`, and `OfflineCommand` as canonical names.

## Reading order and authority

[Terminology and evidence](terminology-and-evidence.md) controls labels and provenance. [Invariants](invariants.md) controls rules that span documents. [Offline venue operations](offline-operations.md) controls degraded-mode behavior and outage limits. A conflict is resolved in this order: invariant, lifecycle transition/offline safety rule, entity constraint, API contract, product requirement. Any unresolved conflict blocks implementation until recorded in [the owner-question register](unknowns-and-owner-questions.md#owner-question-register).
