# Highest-Risk Unknowns and Owner-Question Register

[Back to index](README.md) · [Requirements](product-requirements.md)

## Highest-risk unknowns

| Rank | Unknown | Why it matters | Question |
|---:|---|---|---|
| 1 | Legal merchants, seller/MOR, tax-liable entity, funds flow | Determines provider topology, liability, tax, disputes, payouts, and Connect | OQ-003 |
| 2 | Jurisdictions, currencies, tax, and stored-value law | Changes precision, tax, expiry/escheat, receipts, and methods | OQ-005, OQ-011 |
| 3 | MVP, channels, Terminal, and offline envelope | Changes sequencing, hardware, risk, and testing | OQ-002, OQ-004 |
| 4 | Accounting policies | Changes Journals, liabilities, revenue, refunds, deposits, disputes, and breakage | OQ-012 |
| 5 | Refund and membership policies | Changes lifecycle guards, dunning, entitlement, and disclosures | OQ-006, OQ-007 |
| 6 | Retention/privacy/security obligations | Changes storage, deletion, evidence, incidents, and migration | OQ-010 |
| 7 | Availability and peak load | Changes topology, locking, queues, recovery, and cost | OQ-009 |
| 8 | Migration source access and quality | Changes mapping, reconciliation, cutover, and rollback feasibility | OQ-008 |
| 9 | Roles and approval thresholds | Changes authorization and separation of duties | OQ-013 |
| 10 | Provider contracts and fallback | Changes available methods, Terminal, recurring billing, and reconciliation | OQ-014 |

## Owner-question register

Every assumption driven by these questions remains **UNVERIFIED** until recorded with owner/date/scope/rationale and affected requirement IDs.

| ID | Owner question | Required answer |
|---|---|---|
| OQ-001 | What product name, brand, and customer-facing terminology are approved? | Naming brief |
| OQ-002 | Which capabilities and channels constitute the first production release? | Ranked must/should/defer list |
| OQ-003 | How many Tenants, Venues, legal merchants/sellers exist; who is MOR/tax-liable; is Connect required? | Counsel/accounting-approved entity and funds-flow diagram |
| OQ-004 | Are Terminal and offline sale/check-in required; which region, readers, duration, capacity, payment-risk, clock, queue, and conflict limits apply? | Capability and continuity/risk matrix |
| OQ-005 | What GiftCard scope, currencies, expiry, cash redemption, transfer, breakage, and unclaimed-property rules apply? | Counsel-approved policy matrix |
| OQ-006 | How are mixed-tender refunds allocated and when may value return to GiftCard? | Customer policy and accounting rule |
| OQ-007 | What membership trial, cadence, retry, grace, proration, pause, credit, cancellation, and entitlement rules apply? | Plan-policy matrix |
| OQ-008 | Which source classes/history/retrieval methods are approved and available; what quality, exclusions, cutover, and rollback limits apply? | Signed source inventory and cutover plan |
| OQ-009 | What availability, RTO, RPO, support, maintenance, and measured peak-load targets apply? | Numeric service objectives/workload envelope |
| OQ-010 | What retention, deletion, legal-hold, backup, webhook, audit, privacy, residency, age, accessibility, and breach rules apply? | Approved compliance matrix and retention schedule |
| OQ-011 | Which countries, currencies, languages, tax regimes, settlement currencies, and payment methods launch? | Jurisdiction/currency/method matrix |
| OQ-012 | What chart of accounts and revenue/tax/deposit/dispute/breakage posting policies apply? | Accountant-approved posting catalog |
| OQ-013 | Which roles exist and what refund/discount/void/export/integration limits require separate approval? | Permission and threshold matrix |
| OQ-014 | Which provider features/methods are contractually available and what fallback strategy applies? | Provider capability matrix |

## Decision procedure

A decision updates every cited requirement, lifecycle policy, test, migration control, roadmap gate, and configuration default together. Legal/accounting matters require the appropriate professional approval.
