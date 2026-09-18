# Test Strategy, Migration, Parallel Run, and Roadmap

[Back to index](README.md) · [Requirements](product-requirements.md) · [Unknowns](unknowns-and-owner-questions.md)

## Test strategy

| Layer | Required evidence |
|---|---|
| Unit/property | Money allocation sums; tax rounding; legal state transitions; balanced Journals; nonnegative capacity/stored value; permission predicates. |
| Database/concurrency | RLS isolation; foreign-key Tenant match; simultaneous final-capacity hold; hold expiry vs consumption; duplicate check-in; mixed-tender capture/release; refund limit. |
| Contract | OpenAPI/event-schema compatibility; temporary private-gate contract; Stripe; Yellow Dog capability matrix, pagination/cursors, 2 requests/second limiter, stable sales IDs, 429/`Retry-After`, acknowledgement/reconciliation fake; Splash Radio fake/manual adapter; reporting/export; webhook signature fixtures; API error/idempotency/cursor behavior. |
| Integration | Database+worker+outbox; provider sandbox; delayed/out-of-order/duplicate events; timeout-after-provider-success; payout ingestion. |
| End-to-end | Browse → hold → pay → confirm → issue → check in; cancellation/refund; gift-card mixed tender; recurring membership recovery. |
| Security/privacy | Temporary-gate locked default, repository/passcode scan, salted-verifier secrecy, enumeration/timing resistance, shared rate limits, secure-cookie/CSRF/session expiry, forbidden production capabilities, Tenant escape, BOLA/IDOR, secret scanning, dependency/SAST, export controls, retention/erasure. |
| Resilience | Gate verifier/limiter/session-store failure; queue/database/provider/Yellow Dog outage; Yellow Dog token expiry/single-use refresh race, 429, partial batch, unknown timeout, schema drift, mapping quarantine, dead letter/replay and backlog reconciliation; clock skew, backup restore, internet/local-network loss, UPS/device-battery exhaustion. |
| Finance | Golden journals for sale/tax/fee/refund/dispute/gift card/membership/payout; three-way reconciliation to synthetic provider and bank facts. |
| Performance | Peak capacity contention, checkout latency, scan throughput, offline sync backlog recovery, Yellow Dog initial/incremental mirror and command backlog under the 2 requests/second per-user ceiling, report/export isolation. |
| Usability/reporting | Owners/managers answer the today-at-a-glance and ticket-sales questions in at most three interactions; totals, definitions, and freshness are understandable; CSV schema and reconciliation are deterministic. |

Every defect receives a deterministic test. Production release requires zero unresolved critical/high security findings, zero unexplained financial/capacity differences in the acceptance window, and signed owner acceptance of remaining risks.

## Migration and parallel run

1. **Read-only source inventory:** enumerate every ROLLER data class made available by an approved API/export/report mechanism, including field coverage, history depth, identifiers, timestamps, rate limits, and control totals. Never save, edit, delete, acknowledge, or write back to ROLLER. Any future export/download requires separate explicit authorization.
2. **Mapping and classification:** map all available source data by public/business meaning; quarantine secrets, raw payment data, obsolete UI fields, and unnecessary PII rather than silently dropping them. Record legal basis, source limitations, and reconciliation rules.
3. **Synthetic rehearsal:** generate sanitized fixtures; exercise repeatable extract-transform-load code without production records.
4. **Reference import:** the one Tenant/Venue, roles, catalog, tax/policy snapshots, schedules, resources, and future capacity. Assign stable migration source keys.
5. **Operational and historical import:** import every available booking/order, ticket/check-in, guest reference, waiver/document reference, gift-card/wallet, membership, inventory reference, report/control fact, and integration configuration that can be lawfully represented; unsupported fields enter a migration exception register.
6. **Financial opening/history:** import available non-secret financial history and opening liability/control balances through approved balanced Journals; never fabricate missing processor events or claim unavailable history was migrated.
7. **Shadow read:** compare ticket availability, prices, taxes, entitlements, memberships, simple reports, and control totals while ROLLER remains authoritative and untouched.
8. **Parallel run:** one system is authoritative per operation. Mirrored comparison is read-only toward ROLLER; no dual write or ROLLER writeback is permitted.
9. **Cutover:** after separate approval, choose the final read-only delta point, reconcile, switch customer/staff channels and devices, monitor, and retain a bounded rollback window. ROLLER source data remains unchanged.
10. **Decommission/retention:** revoke only newly created replica-side integration access under separate approval, preserve required evidence, remove unneeded copied data under approved retention rules, and document completeness/exceptions.

### Migration controls

- Every import row has source system, source key, batch, hash, result, and reversal status.
- Re-running a batch is idempotent; changes require a new version.
- Capacity, order totals, ticket validity, CheckIns, GiftCard/wallet liability, membership status, receivables, tax, Journal control balances, and source record counts by class must reconcile independently.
- “All available data” means all data accessible through the approved read-only source contract; unavailable, unreadable, legally excluded, secret, or unsupported fields are explicitly reported, never guessed.
- No dual write without an authoritative owner, conflict rule, replay log, and tested rollback.
- Rollback never deletes financial facts; it reverses/isolates them and restores channel routing.

## Phased roadmap and measurable exit criteria

| Phase | Scope | Exit criteria |
|---|---|---|
| 0. Decisions and controls | Confirm single-merchant funds/tax treatment, currencies, refund/deposit/stored-value policies, SLOs, retention, offline envelope, report catalog, posting rules | Launch-blocking OQs closed; approved state machines, threat model, PCI matrix, golden journals, measured UPS/device runtime, report definitions |
| 1. Repository and temporary access foundation | Use the approved existing repository; single active Tenant/Venue; Owner/VenueManager target RBAC model; RLS; audit/outbox; deployment-configured salted-verifier passcode gate | Local build/test passes; no external push/deploy yet; locked-default/repository-scan/rate-limit/session/CSRF/rotation/fail-closed tests pass; UI labels gate temporary/non-production; restricted capabilities remain disabled |
| 2. Ticket-sales core | Product/Session/CapacityPool/ReservationHold, Order, hosted Stripe payment, webhook inbox, Ticket | End-to-end ticket sale passes; 100k contention test has zero oversells; SCA/duplicate/out-of-order/timeout suite produces one charge and Ticket set |
| 3. Admissions and simple reporting | CheckIn, waiver reference, cancellation/refund, today/ticket/capacity reports, CSV ExportJob | 10k duplicate scans yield one accepted redemption; refund limits pass; owners/managers answer core daily questions in three interactions; report totals reconcile |
| 4. Finance | Journals, provider balances, payouts, bank import, disputes, exceptions | Golden cases balance; 30 simulated days of three-way reconciliation have zero unexplained variance |
| 5. Offline venue continuity | Device registration, manifests, capacity budgets, offline cash ticket/check-in, optional provider-supported offline card mode, UPS/battery runbook | Measured power/runtime floor met; no oversell beyond allocated budgets; duplicate/conflict evidence retained; one-day backlog syncs within approved target; payment risk limits enforced |
| 6. Yellow Dog, Splash Radio, and observed adapters | Yellow Dog-authoritative read-only mirror, capability flags, 2 requests/second limiter, certified asynchronous/idempotent sales outbox and reconciliation; all non-sales Yellow Dog writes disabled; Splash Radio disabled/manual-first seam; disabled Resend placeholder; remaining observed seams | Yellow Dog credentials/permissions/mappings/certification questions resolved before connection; mirror/freshness/full-control tests pass; every sale/return/void/correction is acknowledged and reconciled once; forbidden writes remain unreachable; Splash/other adapters remain disabled unless approved |
| 7. Stored value/memberships | GiftCard mixed tender/liability and MembershipContract billing/dunning/entitlement | Race tests never create negative value; liability equals entries; full membership matrix passes |
| 8. Read-only ROLLER migration/pilot | Complete source inventory, two rehearsals, shadow/parallel comparison, approved cutover/rollback | Every available class is mapped/imported or listed with a reason; source remains unchanged; counts/control totals reconcile; zero unexplained ticket/capacity/financial differences during pilot |
| 9. Later individual authentication | Owner decision for individual accounts, attributable roles, passkeys/WebAuthn, TOTP fallback, recovery, MFA/step-up, Resend security delivery, session/retention policy | OQ-024 resolved; threat model approved; gate sessions cannot upgrade; individual auth/recovery/provider-outage tests pass; shared gate removed before production |
| 10. Later ecosystem review | Revisit full external software inventory and deferred CRM/BI/multi-venue options | New decision record, contracts/licensing/privacy review, measurable business case, and no regression of ticket operations |

Terminal timing, exact offline risk/runtime limits, report/export formats, Yellow Dog contract behavior, Splash Radio identity/contract/licensing/capabilities, launch currencies/jurisdictions, and the later external-software scope remain **UNVERIFIED (OQ-003, OQ-006, OQ-012, OQ-021–OQ-027)**. Stripe Connect is not part of the initial roadmap.
