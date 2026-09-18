# ROLLER Replica — Clean-Room Implementation Specification

Canonical, implementation-ready specification for an independently designed venue-management platform. This package uses only the three sources listed in [Terminology and evidence](terminology-and-evidence.md#authoritative-inputs).

## Document map

1. [Terminology, evidence, provenance, and clean-room rules](terminology-and-evidence.md)
2. [Product requirements and non-goals](product-requirements.md)
3. [Modules, ownership, roles, and permissions](modules-and-permissions.md)
4. [Entity and data model](data-model.md)
5. [Capacity, holds, orders, tickets, and check-ins](commerce-lifecycles.md)
6. [Payments, ledger, refunds, disputes, gift cards, and memberships](finance-lifecycles.md)
7. [Events, webhooks, API, security, PCI, and privacy](interfaces-and-security.md)
8. [Testing, migration, parallel run, and roadmap](delivery-plan.md)
9. [Cross-document invariants](invariants.md)
10. [Highest-risk unknowns and owner questions](unknowns-and-owner-questions.md)
11. [Dependency-free validator](validate.py)

## Canonical design stance

- A provider-neutral modular monolith owns commerce, capacity, entitlements, stored value, memberships, ledger, and reconciliation.
- PostgreSQL is the transactional authority; asynchronous workers perform external calls, webhook processing, and reconciliation.
- Stripe is the first payment adapter, never the domain model. Connect is deferred unless legal seller and payout requirements justify it.
- Every aggregate is tenant-scoped, versioned, audited, and changed through explicit commands and state transitions.

## Authority and conflicts

[Invariants](invariants.md) override lower-level text. Next in precedence are lifecycle transition rules, entity constraints, API contracts, then product requirements. An unresolved policy conflict is recorded in the [owner-question register](unknowns-and-owner-questions.md#owner-question-register) and blocks the affected production feature.
