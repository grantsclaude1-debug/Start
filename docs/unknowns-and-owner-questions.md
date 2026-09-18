# Highest-Risk Unknowns and Owner-Question Register

[Back to index](README.md) · [Requirements](product-requirements.md) · [Operations](operations-integrations-and-reporting.md)

## Resolved owner decisions — 2026-09-18

These are **CONFIRMED** project inputs, not assumptions:

- The launch venue is the sole initial Venue and payment-collecting merchant; do not use Stripe Connect initially.
- Ticket sales are the highest priority; Owner and VenueManager are the primary administrative users.
- Reporting must be simple and understandable with easy permission-controlled downloads.
- Use the approved existing repository; this specification does not authorize a push, deployment, or account change.
- Migrate all ROLLER data made available through an approved read-only mechanism; never modify or write back to ROLLER.
- Design integration seams for every observed system. Yellow Dog is the current inventory system, and the owner also requires Splash Radio venue audio; no private login/contract was available for either.
- Support bounded venue operation during internet and power disruption with honest UPS, battery, payment-risk, capacity, and sync limits.
- The initial private build uses one temporary shared passcode gate configured at deployment as a salted verifier; do not implement Resend, passkeys, TOTP, MFA, recovery, or individual accounts yet.
- Revisit the complete external-software inventory later.

## Highest-risk unknowns

| Rank | Unknown | Why it can invalidate design | Blocking question(s) |
|---:|---|---|---|
| 1 | Legal merchant/seller/tax treatment and supported currencies | Single-merchant is decided, but legal presentation, tax, receipt, and settlement rules still change payment/accounting design | OQ-006, OQ-008, OQ-017 |
| 2 | ROLLER source access and completeness | “All available” depends on approved APIs/exports, history depth, field quality, rate limits, and legal permission | OQ-019, OQ-025 |
| 3 | Offline site envelope and card-present contract | UPS/device runtime, manifests, capacity budgets, offline card authorization, and conflict tolerance govern safety | OQ-003, OQ-021 |
| 4 | Yellow Dog account contract, credentials, mappings, and certification | Public API/rate/transaction facts are known, but account modules, service identity, permissions, store/item/recipe/unit mappings, correction semantics, acknowledgement evidence, sandbox, support, and certified write lanes determine whether mirror/sales capabilities can be enabled | OQ-023 |
| 5 | Reporting/export policy | Exact reports, definitions, formats, sensitive fields, retention, and scheduled delivery determine acceptance and privacy controls | OQ-022 |
| 6 | Accounting, refund, gift-card, and membership policy | Changes Journals, liability, lifecycle guards, dunning, entitlement, and disclosures | OQ-007, OQ-015–OQ-017 |
| 7 | Privacy/security/retention obligations | Changes storage, deletion, evidence, incident response, exports, and migration scope | OQ-011, OQ-012 |
| 8 | Future production authentication | The shared private-build gate cannot support public launch, attributable roles, recovery, MFA, step-up, or sensitive operations; later individual-authentication and Resend policy remains undecided | OQ-024 |
| 9 | Availability and measured peak load | Changes topology, capacity-lock strategy, offline queue, report isolation, and cost | OQ-010, OQ-018 |
| 10 | Splash Radio identity, licensing, and control surface | Wrong-vendor integration, unlicensed public performance, or unsafe assumptions about player/API control would invalidate the adapter | OQ-027 |
| 11 | Deferred external systems | Unknown partners may add data, contract, privacy, or operational constraints | OQ-026 |

## Owner-question register

Every open-question-driven assumption remains **UNVERIFIED** until an answer is recorded in an approved decision log. Resolved portions are noted; the remaining part of the question stays open.

| ID | Owner question | Current status / blocks | Required answer form |
|---|---|---|---|
| OQ-001 | What product name, brand, and customer-facing terminology are approved? | Open; public UX/docs | Approved naming brief |
| OQ-002 | Beyond ticket sales as the top priority, which capabilities constitute the first production release? | Partially resolved; phase scope | Ranked must/should/defer list |
| OQ-003 | Is card-present Stripe Terminal required in the first release, and which region/readers/provider capabilities apply? | Open; payments/offline hardware | Yes/no plus region/device/capability list |
| OQ-006 | Which presentment, settlement, GiftCard, and ledger currencies launch? | Open; money/configuration | ISO currency list and permitted combinations |
| OQ-007 | What GiftCard scope, expiry, cash-redemption, transfer, breakage, and unclaimed-property policies apply? | Open; stored value | Counsel-approved policy matrix |
| OQ-008 | For the single merchant, who is merchant/seller and tax-liable entity for each channel? | Marketplace/Connect resolved out; legal/accounting treatment open | Counsel/accounting-approved funds-flow diagram |
| OQ-009 | Are self-service tenant creation, multi-venue administration, white-label branding, or custom domains initial requirements? | Initial single-venue scope resolved; branding/domain details open | Include/defer per capability |
| OQ-010 | What availability, recovery-time, recovery-point, support, and maintenance-window targets apply? | Open; infrastructure | Numeric service objectives |
| OQ-011 | What retention, deletion, legal-hold, webhook, audit, export, migration-copy, and backup periods apply by data class? | Open; privacy/data | Approved retention schedule |
| OQ-012 | Which countries, languages, accessibility standard/level, age rules, and privacy regimes launch? | Open; compliance/UX | Jurisdiction and standards matrix |
| OQ-013 | Are advanced CRM, generalized BI, workflow automation, marketplace payouts, or a broad partner marketplace initial scope? | Deferred pending later software review | Include/defer by capability |
| OQ-014 | What refund, discount, void, export, integration, and offline-device limits require a second approver? | Open; RBAC/workflows | Permission and threshold matrix |
| OQ-015 | How are mixed-tender refunds allocated, and when may refunds create GiftCard value instead of returning original tender? | Open; Refund lifecycle | Published customer policy and accounting rule |
| OQ-016 | What are membership trial, billing cadence, retry, grace, proration, pause, credit, cancellation, and entitlement policies? | Open; MembershipContract | Plan-policy matrix |
| OQ-017 | What chart of accounts and approved revenue/tax/deposit/dispute/breakage rules apply? | Open; Journal/reconciliation | Accountant-approved posting catalog |
| OQ-018 | What measured peak checkout, hold, scan, POS, webhook, offline-sync, Yellow Dog, and reporting loads must be supported? | Open; capacity/performance | Numeric workload envelope |
| OQ-019 | What ROLLER data classes and history are actually exposed, what is their quality, and what cutover/rollback window is acceptable? | Intent to migrate all available data confirmed; source facts open | Signed source inventory and cutover plan |
| OQ-020 | Which Stripe methods/features are contractually available, and what is the fallback provider strategy? | Connect excluded initially; adapter capability open | Provider capability matrix |
| OQ-021 | What measured device battery and UPS runtimes, offline duration/data freshness, per-device capacity budget, card transaction/count/amount risk ceilings, clock tolerance, queue limit, sync target, and conflict policy are approved? | Open; offline acceptance | Site-tested continuity and risk matrix |
| OQ-022 | Which reports launch, how is each metric defined, which filters/drill-downs/download formats are required, and what export masking/row/retention/scheduling rules apply? | Plain-language downloadable reporting confirmed; details open | Report catalog with sample reconciled outputs |
| OQ-023 | Which Yellow Dog modules/version/topology, API agreement/SOW/fees, sandbox, dedicated least-privilege credential, permissions, rotation/revocation/MFA/IP/mTLS rules, account-specific limits/endpoints, store/item/recipe/unit/correction mappings, ROLLER coexistence, sales acknowledgement/reconciliation report, write-capability certifications, support/SLA, and outage/partial-batch/duplicate recovery procedures apply? | Public Fetch API, 2 requests/second per-user limit, polling, stable sales IDs, and read/mirror direction confirmed; connection remains fake/disabled pending account answers and sales certification; all non-sales writes disabled | Vendor-executed contract, credential/security plan, capability matrix, mapping workbook, certification evidence, reconciliation report, and recovery runbook |
| OQ-024 | Before leaving private-build status, which individual identity, passkey/WebAuthn, TOTP fallback, recovery, MFA/step-up, approval, session, Resend domain/delivery, retention, and support policies are approved? | Initial shared passcode gate resolved; all production identity/Resend capabilities postponed and disabled | Approved authentication threat model, factor/recovery policy, and rollout/removal runbook |
| OQ-025 | Which approved read-only ROLLER retrieval methods may be used, and how are unavailable, sensitive, secret, legally excluded, or unsupported fields reported? | Open; migration completeness claim | Access authorization and exception policy |
| OQ-026 | Which external systems beyond currently observed ROLLER surfaces, Yellow Dog, and Splash Radio are active, authoritative for which data, and prioritized after the later inventory review? | Deliberately deferred | Owner-approved system-of-record/integration inventory |
| OQ-027 | Is Splash Radio, LLC at `splashradio.net` the contracted venue-audio provider; what API/agent/manual controls, authentication, zones/players, schedules/content, webhooks, rate limits, hardware, offline cache, support, retention, and admission-venue music/voice licensing apply? | Production adapter stays mocked/disabled/manual-only | Vendor-confirmed identity, contract, licensing, hardware, and capability matrix |

## Decision procedure

An answer is accepted only when owner, date, scope, rationale, and affected requirement IDs are recorded. Update every cited `UNVERIFIED` assertion, lifecycle policy, test, migration control, and roadmap gate together. Legal/accounting answers require the appropriate professional approver; owner preference alone does not validate regulated treatment.
