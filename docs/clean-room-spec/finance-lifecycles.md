# Payments, Ledger, Refunds, Disputes, Stored Value, and Memberships

[Back to index](README.md) · [Data model](data-model.md) · [API and webhooks](interfaces-and-security.md)

## Initial merchant and provider topology

Merchant/seller/tax-liable entity, account topology, Connect use, funds routing, and supported currencies are **UNVERIFIED (OQ-003, OQ-011)**. Keep Venue, channel, Terminal reader, legal merchant, and provider account as distinct references so the approved topology can be configured without changing domain semantics.

## PaymentAttempt

Canonical states: `CREATED`, `REQUIRES_PAYMENT_METHOD`, `REQUIRES_CUSTOMER_ACTION`, `PROCESSING`, `AUTHORIZED`, `PARTIALLY_CAPTURED`, `CAPTURED`, `FAILED`, `CANCELED`.

| From → To | Guard | Action | Idempotency/concurrency |
|---|---|---|---|
| none → CREATED | Frozen payable version; amount/currency valid | Persist attempt and provider command | Unique business key `pay:{payment}:attempt:{n}` |
| CREATED → REQUIRES_PAYMENT_METHOD / REQUIRES_CUSTOMER_ACTION | Provider requests input/authentication | Persist safe next-action reference | Provider event dedup; never trust browser return alone |
| CREATED/action → PROCESSING | Delayed/asynchronous method accepted | Record pending provider state | Monotonic transition under version lock |
| CREATED/action/PROCESSING → AUTHORIZED | Verified provider fact; amount/currency match | Record authorization/expiry | Provider object/event uniqueness |
| AUTHORIZED → PARTIALLY_CAPTURED/CAPTURED | Capturable amount and policy allow | Create capture; journal economic event | Stable capture key; lock PaymentAttempt |
| Any nonterminal → FAILED/CANCELED | Verified failure or authorized cancel | Release dependent tender/hold according to policy | Terminal repeats are no-op; conflicting success is reconciled |

Provider states map to canonical states and are retained separately. A timeout is `UNKNOWN`, resolved by provider retrieval/reconciliation before a new attempt.

## Refund

States: `REQUESTED`, `APPROVAL_REQUIRED`, `APPROVED`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELED`.

| Transition | Guard/action | Idempotency/concurrency |
|---|---|---|
| none → REQUESTED | Positive amount; captured allocation exists; policy and reason supplied | Unique refund request key |
| REQUESTED → APPROVAL_REQUIRED/APPROVED | Evaluate amount, role, separation of duties, service/check-in policy | Expected version; approval actor differs when required (**UNVERIFIED OQ-013**) |
| APPROVED → PROCESSING | Atomically reserve refundable amount; enqueue provider/stored-value command | Lock Payment/TenderAllocation; stable provider key |
| PROCESSING → SUCCEEDED | Verified provider/stored-value result | Append reversal Journal; adjust projections; emit `refund.succeeded.v1` | Unique provider refund and Journal source |
| PROCESSING → FAILED | Definitive provider failure | Release reserved refundable amount; preserve evidence | Retry same command only when provider contract permits |
| REQUESTED/APPROVAL_REQUIRED/APPROVED → CANCELED | No provider mutation started | Record actor/reason | Terminal no-op on repeat |

Mixed-tender refund allocation is policy-driven and versioned; no allocation may exceed original tender capture. Policy is **UNVERIFIED (OQ-006)**.

## Dispute

States: `OPEN`, `ACCEPTED`, `EVIDENCE_PREPARED`, `SUBMITTED`, `WON`, `LOST`, `WITHDRAWN`.

| Transition | Guard/action | Idempotency/concurrency |
|---|---|---|
| provider event → OPEN | Verified unique dispute; match captured attempt | Persist deadline; journal processor debit/receivable/loss policy |
| OPEN → ACCEPTED | Authorized user chooses acceptance before deadline | Submit provider command and audit | Stable command key; deadline/version guard |
| OPEN → EVIDENCE_PREPARED | Evidence manifest contains approved minimized artifacts | Freeze manifest version | Hash-addressed manifest; no silent overwrite |
| EVIDENCE_PREPARED → SUBMITTED | Before deadline; authorized approval | Submit once; store receipt | Stable submission key |
| OPEN/SUBMITTED → WON/LOST/WITHDRAWN | Verified provider/network outcome | Append balancing Journal and close case | Unique outcome event; conflicting events reconcile |

The platform does not decide external adjudication. Evidence access is least-privilege and retention-controlled.

## GiftCard and StoredValueEntry

GiftCard states: `PENDING`, `ACTIVE`, `SUSPENDED`, `EXHAUSTED`, `EXPIRED`, `CANCELED`. Entry types: `ISSUE`, `AUTHORIZE`, `CAPTURE`, `RELEASE`, `CREDIT`, `DEBIT`, `EXPIRE`, `ADJUST`.

| Transition | Guard/action | Idempotency/concurrency |
|---|---|---|
| PENDING → ACTIVE | Issuance tender settled or approved policy | Append ISSUE/CREDIT and liability Journal | Unique issuance source; lock GiftCard |
| ACTIVE → SUSPENDED | Authorized fraud/admin reason | Stop new authorizations; retain balance | Expected version and audit |
| ACTIVE → EXHAUSTED | CAPTURE/DEBIT makes balance zero | Append entry and update projection | Lock GiftCard; source key unique; never below zero |
| ACTIVE/SUSPENDED → EXPIRED | Approved expiry policy/date permits | Append EXPIRE and accounting treatment | Legal policy version; scheduled key (**UNVERIFIED OQ-005**) |
| PENDING/ACTIVE/SUSPENDED → CANCELED | No impermissible outstanding authorization; policy permits | Release authorizations; append adjustment/reversal | Expected version |

Mixed tender first appends `AUTHORIZE`, then captures value only with Order confirmation; payment failure appends `RELEASE`. GiftCard is not a processor coupon or payment method token.

## MembershipContract

Contract states: `SCHEDULED`, `ACTIVE`, `GRACE`, `SUSPENDED`, `PENDING_CANCELLATION`, `TERMINATED`. Billing and entitlement statuses are separate fields.

| Transition | Guard/action | Idempotency/concurrency |
|---|---|---|
| none → SCHEDULED | Accepted terms/consent and plan snapshot | Create schedule and setup/collection command | Unique enrollment key |
| SCHEDULED → ACTIVE | Start reached and initial-payment/trial policy satisfied | Activate benefits; emit `membership.activated.v1` | Contract version + invoice source uniqueness |
| ACTIVE → GRACE | Invoice collection failed and grace policy applies | Restrict/retain benefits per policy; schedule retry | Unique invoice attempt sequence |
| GRACE → ACTIVE | Invoice paid/recovered | Restore benefits and next due date | Verified payment event, expected version |
| GRACE/ACTIVE → SUSPENDED | Failure/risk/manual policy applies | Suspend entitlement according to policy | Command key and audit |
| SUSPENDED → ACTIVE | Arrears resolved and reactivation permitted | Restore entitlement | Recovery source uniqueness |
| ACTIVE/GRACE/SUSPENDED → PENDING_CANCELLATION | Valid cancellation request | Fix termination/effective date | Unique request key |
| Any eligible → TERMINATED | Effective end reached or authorized immediate termination | Stop future billing; end entitlement; retain history | Terminal and idempotent |

Dunning cadence, grace access, proration, pauses, credits, and cancellation timing are **UNVERIFIED (OQ-007)**.

## Ledger and reconciliation

Every economic event creates one immutable balanced Journal per legal entity and currency. Typical control accounts include cash, processor receivable, accounts receivable, deferred revenue, earned revenue, tax payable, gift-card liability, membership liability, fees, dispute receivable/loss, and refunds/contra-revenue. Posting rules are versioned and approved; corrections reverse and replace.

Daily reconciliation matches internal captures/refunds/fees/disputes to each approved legal merchant’s provider balance movements, groups them to payouts, and matches payouts to bank deposits; merchant cardinality remains **UNVERIFIED (OQ-003)**. Exceptions include missing source/journal, duplicate, amount/currency mismatch, aged pending funds, unmatched payout/deposit, and unresolved negative balance. Webhooks provide timeliness; provider reports and bank facts provide completeness.
