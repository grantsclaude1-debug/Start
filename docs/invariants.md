# Cross-Document Invariants

[Back to index](README.md)

These rules override conflicting lower-level text.

1. **Initial topology:** Production launch permits exactly one active Tenant and one active Venue for the launch venue, with one payment-collecting merchant and no Stripe Connect; retained Tenant/Venue keys remain mandatory safety boundaries.
2. **Tenant:** Every business command, row, event, cache key, job, log context, and provider mapping resolves exactly one trusted `tenant_id`; cross-Tenant reads/writes are denied by application checks and database RLS.
3. **Venue scope:** Venue-scoped operations cannot widen scope through client input, nested IDs, exports, or background jobs.
4. **Money:** Amounts are integer minor units with explicit currency; one financial aggregate/Journal is single-currency; allocations and balanced Postings sum exactly.
5. **Provider neutrality:** Provider IDs/statuses live in adapter/reference records and never define Order, Ticket, GiftCard, MembershipContract, or Journal semantics.
6. **Capacity:** `confirmed + active_holds + active_blocks <= capacity_total` for each bucket after every committed transaction; no asynchronous repair is accepted as oversell prevention.
7. **Hold conversion:** A ReservationHold releases, expires, cancels, or converts exactly once; terminal states never reactivate.
8. **Order separation:** Commercial, payment, capacity, and fulfillment states remain separate and derive only through explicit transitions.
9. **Ticket redemption:** A final-use Ticket has at most one ACCEPTED final CheckIn; all attempts are append-only and auditable.
10. **External truth:** Browser redirects and API timeouts are not financial truth; verified provider state plus reconciliation resolves uncertainty.
11. **Idempotency:** Repeating the same semantic command yields the same durable effect; reusing a key with different normalized input is rejected.
12. **Concurrency:** Mutable aggregates require an expected version or lock; lock ordering is deterministic and retries are bounded.
13. **Ledger:** Every economic event has at most one Journal per posting-rule version; each Journal balances; corrections reverse and replace.
14. **Refunds:** Successful Refund totals never exceed refundable captured tender and follow the original allocation/policy.
15. **Stored value:** GiftCard balance is an append-only projection, never negative, never silently edited, and reconciles to liability.
16. **Membership:** Contract, billing, and entitlement states are distinct; provider subscription state cannot directly grant access.
17. **Events:** Aggregate mutation and OutboxEvent commit together; consumers tolerate duplicate and out-of-order delivery.
18. **Webhooks:** Provider webhooks are authenticated before parsing into trusted context, deduplicated, durable, replayable, and not completeness evidence.
19. **Audit:** Permission, financial, fulfillment, migration, and administrative changes preserve actor/service, reason, correlation, time, and prior/new version without storing secrets.
20. **Privacy:** Events/logs exclude raw card data, secrets, scan tokens, signatures, and unnecessary PII; erasure preserves legally required non-personal evidence.
21. **Time:** Instants use UTC; Venue schedules retain IANA zone and local-time intent; expiry uses trusted database/service time.
22. **Migration:** Imported records retain source/batch/hash provenance; repeated import is idempotent; opening financial values enter through balanced Journals. ROLLER access is read-only and no migration or parallel-run path may write back to or modify the source.
23. **Offline:** Offline commands are device-signed, sequenced, encrypted, idempotent on sync, and limited by pre-issued policy/capacity budgets; conflicts remain visible and no degraded mode stores raw card data.
24. **Reporting:** Reports derive from governed projections; every total has a definition/freshness time, exports are asynchronous and audited, and report load cannot block checkout or check-in.
25. **Temporary access gate:** The initial private build uses one shared deployment-configured passcode gate; no plaintext passcode is hard-coded, committed, logged, or stored, only a versioned salted verifier/secret reference is configured; attempts are rate-limited; the gate grants no individual identity, role assurance, MFA, approval, or production authorization. Resend, passkeys, TOTP, recovery, and individual accounts remain disabled until a future owner-approved phase.
26. **Integrations:** Every adapter is disabled by default, uses versioned mappings and durable idempotent commands, reconciles acknowledgements, and cannot become an undocumented system of record.
27. **Clean room:** No proprietary code, assets, UI copy/layout, private records, venue-specific commercial figures, or reverse-engineered private schema enters implementation artifacts.
28. **Offline power boundary:** No software capability is claimed without powered edge, network, and operator hardware; a total loss of usable power stops electronic operation.
29. **Offline capacity:** Cloud and edge never sell from the same unpartitioned capacity or stock. Edge sales consume only signed, versioned grants allocated before the outage.
30. **Offline payment truth:** A Stripe Terminal payment stored offline is pending authorization, never paid/approved, until Stripe returns authoritative success after forwarding.
31. **Offline evidence:** Local domain mutation, Journal/Audit entry, and outbox event commit atomically; sync conflicts append exceptions or compensations and never erase original facts.
32. **Offline redemption:** Authentic QR signature verification is distinct from unused status; definitive offline redemption requires the shared edge registry or a non-overlapping lane budget.
33. **Venue audio:** The Splash Radio/venue-audio adapter is disabled or manual until vendor, contract, licensing, authentication, capabilities, and hardware are verified; ticketing, payments, admission, and life safety never depend on it.
34. **Yellow Dog authority:** Yellow Dog owns inventory masters and on-hand truth; the platform owns its read-only mirror and sales outbox. Checkout/admission never wait on Yellow Dog. Only vendor-certified sales/return/void/correction submission may write initially, using stable IDs, ≤2 requests/second per user, remote evidence, and reconciliation; every other Yellow Dog write is capability-denied.

Any proposed exception requires an architecture decision record, security/financial impact analysis where relevant, tests, and owner approval if it changes an `OQ-###` decision.
