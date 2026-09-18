# Modules, Ownership, Roles, and Permissions

[Back to index](README.md) · [Data model](data-model.md) · [Invariants](invariants.md)

## Module boundaries

| Module | Owns | May reference, never mutate directly |
|---|---|---|
| Identity & Access | Initial `GateConfig`, `GateSession`, `GateAttempt`; future `User`, `Role`, `RoleBinding`, individual sessions/authenticators and recovery | All module resources by opaque ID |
| Catalog & Pricing | `Product`, `Price`, `TaxCode`, `DiscountRule`, sale snapshots | Orders and Sessions |
| Capacity | `Session`, `CapacityPool`, `CapacityBlock`, `ReservationHold` | Product snapshot, Order ID |
| Orders | `Order`, `OrderLine`, adjustments, receivable summary | Holds, Payments, Tickets |
| Admissions | `Ticket`, `CheckIn`, waiver/consent evidence reference | OrderLine, Session, MembershipContract |
| Payments | `Payment`, `TenderAllocation`, `PaymentAttempt`, `Refund`, `Dispute`, provider references | Order/Invoice totals; Journal source IDs |
| Stored Value | `GiftCard`, `StoredValueEntry` | TenderAllocation, Journal source IDs |
| Memberships | `MembershipContract`, billing schedule, entitlement policy | Payment/Invoice and Ticket references |
| Finance | `Journal`, `Posting`, provider balance movement, payout, reconciliation exception | Immutable source event IDs |
| Integrations | `WebhookInbox`, `ApiClient`, `OutboxEvent`, adapter configuration, mapping/checkpoint/acknowledgement records | Published snapshots only |
| Offline Operations | `DeviceRegistration`, `OfflineManifest`, `OfflineCapacityBudget`, `OfflineStockBudget`, `OfflineCommand`, sync resolution | Signed snapshots and commands exposed by owning modules |
| Audit & Reporting | `AuditEntry`, projections, report definitions, `ExportJob` | Read-only module events |

Cross-module changes occur through commands plus transactional domain/outbox events. A module exposes read models and command interfaces; no module writes another module's tables.

## System roles

Permissions are the target production model and are additive but constrained by Tenant/Venue scope and separation-of-duty policies. The initial shared private-build gate cannot identify a person or enforce these roles; role-protected production mutations remain disabled until individual authentication is implemented.

| Role | Default scope | Typical grants | Explicit exclusions |
|---|---|---|---|
| PlatformOperator | Platform | Incident support through audited, approved impersonation | Not a primary venue user; no payment-secret access or silent data access |
| Owner | Launch venue | Venue/role/policy configuration, reports, integration approvals, high-risk review | Cannot bypass immutable audit/ledger or professional approvals |
| VenueManager | Launch venue | Catalog, schedules, bookings, staff operations, reports, bounded approved refunds | No owner-only identity, payment-account, or integration-secret control |
| FinanceManager | Tenant or Venue | Refund approval, disputes, reconciliation, financial reports | No catalog/capacity changes by default |
| Cashier | Venue/device | Create orders, collect approved tenders, issue receipts | No role changes, exports, payout or tax policy |
| AdmissionsAgent | Venue/device | Ticket lookup and CheckIn | No order/payment edits |
| ReportViewer | Scoped | Read approved projections/exports | No mutation; PII fields minimized |
| IntegrationClient | Tenant/Venue | Explicit OAuth/API scopes | No interactive login or implicit broad grants |
| Auditor | Scoped, time-bound | Read audit/config/ledger evidence | No mutation |

## Permission model

Permission key format is `module.resource.action`, for example `orders.order.read`, `payments.refund.approve`, and `admissions.checkin.create`. Every authorization evaluates:

1. authenticated individual principal and session assurance/MFA in production; the temporary shared gate cannot satisfy this check;
2. Tenant equality;
3. Venue/resource scope;
4. permission key;
5. object guards, such as refund limits or closed accounting periods;
6. separation of duties and step-up approval;
7. device/API-client constraints.

Owner and VenueManager are the primary target application roles. High-risk grants include role administration, tax configuration, payment configuration, refunds, dispute submission, exports, integration credentials, offline-device enrollment, audit access, and support impersonation. None is authorized by the temporary shared gate. After individual authentication is approved, grant/revoke/use events are attributable and audited; refund requester and approver differ above an owner-approved threshold (`OQ-014`), and emergency access is time-bound, reasoned, alerted, and reviewed.

## Ownership invariants

- Launch configuration permits exactly one active Tenant and one active Venue for the launch venue. Each mutable business row still includes `tenant_id`, `version`, `created_at`, and `updated_at`; Venue-scoped rows also include `venue_id`.
- Global identifiers do not authorize access; authorization always resolves Tenant scope.
- Audit and financial records are append-only. Corrections append compensating facts.
- Provider credentials belong to a secret manager and are referenced by opaque configuration IDs only.
