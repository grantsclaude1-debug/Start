# Booking, Capacity, Order, Ticket, and Check-In Lifecycles

[Back to index](README.md) · [Data model](data-model.md) · [Events](interfaces-and-security.md#event-catalog)

## ReservationHold state machine

Canonical states: `ACTIVE`, `CONSUMED`, `RELEASED`, `EXPIRED`, `CANCELED`.

| From → To | Guard | Atomic action | Idempotency and concurrency |
|---|---|---|---|
| none → ACTIVE | Session sellable; quantity positive; uncommitted capacity sufficient | Lock CapacityPool bucket; add held quantity; set expiry; emit `capacity.hold.created.v1` | Unique hold command key; serializable transaction or row/advisory lock |
| ACTIVE → CONSUMED | Unexpired; matching Order confirmation; full quantity available to convert | Move held to confirmed; link Order; emit `capacity.hold.consumed.v1` | Expected version and unique Order/hold consumption |
| ACTIVE → RELEASED | Explicit abandon/cancel; not consumed | Subtract held quantity; emit `capacity.hold.released.v1` | Repeated release returns current terminal state |
| ACTIVE → EXPIRED | Database time >= `expires_at`; not consumed | Subtract held quantity; emit `capacity.hold.expired.v1` | Expiry worker claims locked rows with skip-locked batching |
| ACTIVE → CANCELED | Session canceled by authorized operator | Release quantity and reason | Session-cancel command key; lock pool then hold in fixed order |

Terminal states never reactivate. Payment success after expiry enters exception handling: attempt a new hold atomically; if unavailable, do not issue Ticket and initiate the approved refund/manual-resolution policy.

## Order state machine

Canonical states: `DRAFT`, `PENDING_PAYMENT`, `CONFIRMED`, `PARTIALLY_FULFILLED`, `FULFILLED`, `CANCELED`, `REFUNDED`, `EXPIRED`.

| From → To | Guard | Action | Idempotency/concurrency |
|---|---|---|---|
| none → DRAFT | Authenticated/guest session and valid channel | Snapshot lines/policies and compute totals | Unique create key |
| DRAFT → PENDING_PAYMENT | Pricing current; required holds ACTIVE; totals valid | Freeze order version; create Payment | Expected version; one Payment per frozen payable version |
| PENDING_PAYMENT → CONFIRMED | Required amount captured/approved and holds consumable | Consume holds, create Tickets, journal sale, emit confirmation | Single transaction; unique confirmation event/source |
| CONFIRMED → PARTIALLY_FULFILLED | At least one Ticket checked in | Update projection only | Derived from unique CheckIn records |
| CONFIRMED/PARTIALLY_FULFILLED → FULFILLED | All required lines fulfilled or service completed | Recognize fulfillment event per policy | Unique line fulfillment key |
| DRAFT/PENDING_PAYMENT → EXPIRED | Checkout/hold deadline passed and no irreversible capture | Release holds; close payable | Expiry command key and expected version |
| DRAFT/PENDING_PAYMENT/CONFIRMED → CANCELED | Cancellation policy permits; no unresolved check-in conflict | Cancel valid Tickets; release future capacity; initiate refunds separately | Cancellation key; lock Order before Tickets/holds |
| CONFIRMED/CANCELED/FULFILLED → REFUNDED | All refundable captured tender successfully refunded; policy permits | Mark financial projection only | Derived from Refund terminal events |

Edits create a new Order version with delta pricing/capacity; confirmed history is not overwritten.

## Ticket and CheckIn state machines

Ticket states: `PENDING`, `VALID`, `PARTIALLY_REDEEMED`, `REDEEMED`, `VOID`, `EXPIRED`. CheckIn results: `ACCEPTED`, `DUPLICATE`, `TOO_EARLY`, `TOO_LATE`, `VOID`, `WRONG_VENUE`, `WAIVER_REQUIRED`, `OFFLINE_PENDING`, `REJECTED`.

| Ticket transition / CheckIn result | Guard | Action | Idempotency/concurrency |
|---|---|---|---|
| PENDING → VALID | Order confirmation and fulfillment gate satisfied | Activate random token; emit `ticket.issued.v1` | Unique Ticket per entitlement unit/rule |
| VALID → PARTIALLY_REDEEMED | Multi-use Ticket; remaining uses > consumed quantity | Append ACCEPTED CheckIn; decrement projection | Unique device check-in key; lock Ticket/version |
| VALID/PARTIALLY_REDEEMED → REDEEMED | Valid time/Venue; final allowed use; waiver/approval satisfied | Append ACCEPTED CheckIn; set redemption projection | Atomic compare-and-set prevents double admission |
| Any nonterminal → VOID | Order cancellation/refund policy or authorized manual void | Append reason; emit `ticket.voided.v1` | Void command key; no deletion of CheckIns |
| VALID/PARTIALLY_REDEEMED → EXPIRED | Validity ended | Mark expired projection | Deterministic scheduled command |
| Terminal/invalid → unchanged | Guard fails | Append non-ACCEPTED CheckIn with reason | Same scan request returns same result |
| Offline scan → unchanged/OFFLINE_PENDING | Approved offline policy and signed, unexpired manifest permit provisional admission | Queue a device-signed command for server resolution | Device sequence + request ID; cross-device conflicts surface for review (**UNVERIFIED OQ-004**) |

A `CheckIn` is never updated or deleted. Corrections append a supervisory audit action and, if policy allows, a new entitlement adjustment.

## Offline sale and admission resolution

Offline sale/check-in is **UNVERIFIED (OQ-004)**. If approved, it may consume only a pre-issued, non-overlapping capacity budget assigned to a registered device and Session. Card-present offline acceptance additionally requires explicit provider support and approved amount/count/time risk limits; local acceptance remains provisional until provider settlement. Refunds, shared GiftCard value changes, membership changes, role/configuration changes, and exports remain online-only.

On reconnection, commands upload in device-sequence order but the server remains tolerant of duplicate and delayed delivery. Each command resolves to `ACCEPTED`, `DUPLICATE`, `CONFLICT`, `EXPIRED_POLICY`, or `MANUAL_REVIEW`; accepted capacity consumes the device budget exactly once. Cross-device duplicate check-ins and any payment rejection remain visible exceptions and never overwrite earlier evidence. The power, battery, queue, freshness, payment-risk, and synchronization envelope remains **UNVERIFIED (OQ-004)**.

## Capacity calculation

For each locked capacity bucket: `available = capacity_total - confirmed - active_holds - active_blocks`. All operands use the same Session/pool/time-slice and Tenant. Negative availability is a constraint failure, not a display warning. Capacity projections are rebuilt from source rows and compared continuously.
