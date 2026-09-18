# Test Strategy, Migration, Parallel Run, and Roadmap

[Back to index](README.md) · [Requirements](product-requirements.md) · [Unknowns](unknowns-and-owner-questions.md)

## Test strategy

| Layer | Required evidence |
|---|---|
| Unit/property | Money allocation sums; tax rounding; legal transitions; balanced Journals; nonnegative capacity/value; permission predicates. |
| Database/concurrency | RLS isolation; Tenant FK match; final-capacity races; expiry vs consumption; duplicate CheckIn; mixed tender; refund ceiling. |
| Contract | OpenAPI/event compatibility; provider mappings; webhook signatures; errors, idempotency, cursor, and version behavior. |
| Integration | Database, worker, outbox, provider sandbox; delayed/duplicate/out-of-order events; timeout after provider success; payout ingestion. |
| End-to-end | Browse → hold → pay → confirm → issue → CheckIn; cancellation/refund; mixed tender; membership recovery. |
| Security/privacy | Tenant escape, BOLA/IDOR, privilege escalation, MFA/step-up, secret scan, export control, retention/erasure. |
| Resilience | Queue/database/provider outage, webhook storm, clock skew, expired authorization, dead-letter replay, backup restore. |
| Finance | Golden Journals for sale/tax/fee/refund/dispute/gift card/membership/payout; three-way reconciliation. |
| Performance | Peak hold contention, checkout latency, scan throughput, backlog recovery, report isolation. |

Release requires deterministic regression tests, no unresolved critical/high security defects, and no unexplained financial/capacity variance during the acceptance window.

## Migration and parallel run

1. Inventory approved source classes, fields, identifiers, timestamps, history, legal basis, and control totals using read-only methods.
2. Quarantine secrets, raw payment data, obsolete internals, and unnecessary PII; record every exclusion.
3. Rehearse repeatable idempotent transforms with synthetic fixtures.
4. Import reference data, then future operational data, then approved history with stable source keys and batch hashes.
5. Load opening financial/liability balances only through approved balanced Journals; never fabricate missing provider facts.
6. Shadow-compare availability, prices, taxes, entitlements, memberships, reports, and control totals while the source remains authoritative.
7. During parallel run, designate exactly one authority per operation; never dual-write without an approved conflict/replay/rollback design.
8. At approved cutover, take final deltas, reconcile, switch channels, monitor, and retain a bounded rollback window.
9. Preserve required evidence and remove copied data only under approved retention rules.

“All available” means available through the approved read-only contract; unavailable, unreadable, legally excluded, secret, or unsupported fields are explicitly reported.

## Phased roadmap and measurable exit criteria

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | Decisions, legal/accounting controls, threat model, PCI matrix | Launch-blocking OQs closed; state machines and golden Journals approved |
| 1 | Tenancy, identity/RBAC/RLS, catalog, Session, capacity, ReservationHold, audit/outbox | Cross-Tenant denial passes; 100k contending holds produce zero oversells; projection rebuild matches sources |
| 2 | Order, hosted online payment, Stripe adapter, webhook inbox, Ticket | SCA success/failure, duplicate/out-of-order, and timeout tests produce one charge and one confirmation |
| 3 | CheckIn, waiver reference, cancellation, full/partial Refund | 10k duplicate scans yield one accepted final redemption; refund/approval tests pass |
| 4 | Journal, provider balances, payouts, bank import, Dispute, reconciliation | Golden cases balance; 30 simulated days have zero unexplained variance |
| 5 | GiftCard mixed tender and MembershipContract billing/entitlements | Race tests never create negative value; liability reconciles; lifecycle matrix passes |
| 6 | Approved POS/Terminal/offline capabilities | Disconnect/recovery and duplicate-payment tests pass; risk limits and reconciliation exact |
| 7 | Migration rehearsal, shadow comparison, parallel pilot, cutover/rollback | Two repeatable rehearsals; every approved class mapped/imported or exception-listed; control totals reconcile |
| 8 | Stable external API/webhooks and approved reporting/accounting adapters | Certification, replay/dedup proof, privacy review, and deprecation runbook complete |

Phases 5–8 may be reordered only after resolving their cited owner questions and preserving preceding safety gates.
