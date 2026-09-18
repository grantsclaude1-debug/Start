# Cross-Document Invariants

[Back to index](README.md)

1. **Tenant:** Every command, row, event, cache key, job, log context, and provider mapping resolves one trusted `tenant_id`; application checks and RLS deny cross-Tenant access.
2. **Venue:** Venue scope cannot widen through client input, nested IDs, exports, or jobs.
3. **Money:** Integer minor units plus explicit ISO currency; each aggregate/Journal is single-currency; allocations and Postings sum exactly.
4. **Provider neutrality:** Provider IDs/statuses never define Order, Ticket, GiftCard, MembershipContract, or Journal semantics.
5. **Capacity:** `confirmed + active_holds + active_blocks <= capacity_total` after every commit; asynchronous repair is not oversell prevention.
6. **Hold conversion:** ReservationHold releases, expires, cancels, or converts exactly once; terminal states do not reactivate.
7. **State separation:** Commercial, payment, capacity, and fulfillment states change only through explicit transitions.
8. **Redemption:** A final-use Ticket has at most one accepted final CheckIn; all attempts are append-only.
9. **External truth:** Browser returns and timeouts are not financial truth; verified provider state plus reconciliation resolves uncertainty.
10. **Idempotency:** The same semantic command has one durable effect; same key/different normalized input is rejected.
11. **Concurrency:** Mutable aggregates use expected versions or deterministic locks; retries are bounded.
12. **Ledger:** One Journal per economic source/posting-rule version; every Journal balances; corrections reverse and replace.
13. **Refunds:** Successful Refund totals never exceed refundable captured tender and follow approved allocation policy.
14. **Stored value:** GiftCard balance is an append-only projection, never negative, and reconciles to liability.
15. **Membership:** Contract, billing, and entitlement states are distinct; provider subscription state cannot directly grant access.
16. **Events:** Aggregate mutation and OutboxEvent commit together; consumers tolerate duplicate/out-of-order delivery.
17. **Webhooks:** Webhooks are authenticated, deduplicated, durable, replayable, and not completeness evidence.
18. **Audit:** Permission, financial, fulfillment, migration, and administrative changes preserve actor/service, reason, correlation, time, and versions without secrets.
19. **Privacy:** Events/logs exclude raw card data, secrets, scan tokens, signatures, and unnecessary PII; erasure preserves legally required non-personal evidence.
20. **Time:** Instants use UTC; Venue schedules retain IANA zone and local intent; expiry uses trusted service/database time.
21. **Migration:** Imported records retain source/batch/hash provenance; repeat import is idempotent; opening financial values use balanced Journals.
22. **Clean room:** No proprietary code/assets/UI copy, private records, account-specific figures, or reverse-engineered schema enters implementation artifacts.

An exception requires an architecture decision record, impact analysis, tests, and any applicable owner/professional approval.
