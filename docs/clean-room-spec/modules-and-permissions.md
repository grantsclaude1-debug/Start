# Modules, Ownership, Roles, and Permissions

[Back to index](README.md) · [Data model](data-model.md) · [Invariants](invariants.md)

## Module boundaries

| Module | Owns | May reference, never mutate directly |
|---|---|---|
| Identity & Access | `Tenant`, `Venue`, `User`, `Role`, `RoleBinding`, sessions, MFA policy | Other resources by opaque ID |
| Catalog & Pricing | `Product`, prices, tax codes, discounts, immutable sale snapshots | Orders and Sessions |
| Capacity | `Session`, `CapacityPool`, `CapacityBlock`, `ReservationHold` | Product snapshot, Order ID |
| Orders | `Order`, `OrderLine`, adjustments, receivable summary | Holds, Payments, Tickets |
| Admissions | `Ticket`, `CheckIn`, waiver/consent evidence references | OrderLine, Session, MembershipContract |
| Payments | `Payment`, `TenderAllocation`, `PaymentAttempt`, `Refund`, `Dispute`, provider references | Order/Invoice totals; Journal source IDs |
| Stored Value | `GiftCard`, `StoredValueEntry` | TenderAllocation, Journal source IDs |
| Memberships | `MembershipContract`, billing schedule, entitlement policy | Payment/Invoice and Ticket references |
| Finance | `Journal`, `Posting`, provider balance movement, payout, reconciliation exception | Immutable source IDs |
| Integrations | `WebhookInbox`, API clients, `OutboxEvent`, adapter configurations/mappings/checkpoints, inventory commands/acknowledgements | Published snapshots only |
| Device & Edge (conditional) | `DeviceRegistration`, `OfflineManifest`, offline capacity/stock budgets, `OfflineCommand` | Session, Ticket, Product, and policy snapshots; enabled only if **UNVERIFIED OQ-004** is approved |
| Audit & Reporting | `AuditEntry`, projections, report definitions, export jobs | Read-only events |

Cross-module change uses commands and transactional domain/outbox events. A module never writes another module’s tables.

## System roles

Final role names/thresholds are **UNVERIFIED (OQ-013)**. The canonical baseline is:

| Role | Scope | Typical grants | Explicit exclusions |
|---|---|---|---|
| PlatformOperator | Platform | Time-bound audited incident support | No silent access or payment-secret access |
| TenantOwner | Tenant | Tenant/Venue/role/policy configuration and high-risk review | Cannot bypass audit, ledger, or professional approvals |
| VenueManager | Venue | Catalog, schedules, bookings, staff operations, bounded refunds, reports | No platform or payment-account administration by default |
| FinanceManager | Tenant/Venue | Refund approval, disputes, reconciliation, financial reports | No capacity/catalog mutation by default |
| Cashier | Venue/device | Orders, approved tenders, receipts | No roles, exports, payouts, or tax policy |
| AdmissionsAgent | Venue/device | Ticket lookup and CheckIn | No order/payment edits |
| ReportViewer | Scoped | Approved read models/exports | No mutation; minimized PII |
| IntegrationClient | Tenant/Venue | Explicit machine scopes | No interactive login or implicit broad grants |
| Auditor | Time-bound scope | Audit/configuration/ledger evidence | No mutation |

## Permission model

Permission keys use `module.resource.action`. Every decision evaluates authenticated principal/session assurance, trusted Tenant, Venue/resource scope, permission, object guards, separation of duties, step-up, and device/client constraints. Grant/revoke/use events are audited. Emergency access is time-bounded, reasoned, alerted, and reviewed.

## Ownership invariants

Every mutable business row carries `tenant_id`, `version`, `created_at`, and `updated_at`; Venue-scoped rows carry `venue_id`. Identifiers never authorize access. Provider credentials live in a secret manager and are referenced by opaque IDs. Financial and audit evidence is append-only; corrections are compensating facts.
