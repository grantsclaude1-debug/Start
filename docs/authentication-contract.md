# Temporary Private-Build Passcode Gate

[Back to index](README.md) · [Requirements](product-requirements.md) · [Roles](modules-and-permissions.md) · [API/security](interfaces-and-security.md) · [Roadmap](delivery-plan.md) · [Owner questions](unknowns-and-owner-questions.md)

**Contract version:** 2.0 draft
**Decision date:** 2026-09-18
**Scope:** the initial private build only.

This document uses **CONFIRMED**, **INFERRED**, and **UNVERIFIED** as defined in [Terminology and evidence](terminology-and-evidence.md). It intentionally replaces the earlier launch design for Resend, passkeys, TOTP, individual accounts, MFA, and recovery.

## Owner decision and safety boundary

| Status | Contract statement |
|---|---|
| **CONFIRMED** | The initial private build uses one simple shared login passcode gate only. |
| **CONFIRMED** | Do not implement Resend, passkeys/WebAuthn, TOTP, email verification, emailed OTP, invitations, account recovery, or individual user authentication in this initial phase. |
| **CONFIRMED** | Never hard-code or commit the passcode. Deployment setup must provide a salted verifier through an approved secret/configuration mechanism. |
| **CONFIRMED** | Passcode attempts are rate-limited and audited without logging the submitted passcode. |
| **CONFIRMED** | The gate is temporary and **not production authentication**. Resend, passkeys, TOTP, individual accounts, MFA, and recovery remain a recommended later phase requiring a future owner decision. |
| **INFERRED** | Because every entrant shares one secret, the system cannot identify an individual, enforce person-specific roles, prove who approved an action, revoke one person, or provide separation of duties. |
| **INFERRED** | Until individual authentication exists, the private build must not be publicly discoverable or contain live customer/payment/waiver data, real payment credentials, production exports, or enabled high-risk external mutations. |

The gate is an access-speed bump for a controlled private demonstration. It is not acceptable for public launch, staff production use, payment administration, refunds, exports of sensitive data, integration-secret management, role administration, offline-device enrollment, or any workflow requiring attributable approval.

## Initial architecture

```text
private browser
  → HTTPS/private deployment boundary
  → rate limiter
  → POST /api/v1/private-gate/session
  → constant-time verifier check
  → short-lived secure gate session
  → private-build routes with high-risk capabilities disabled
```

Canonical records:

```text
GateConfig(
  version,
  verifier_secret_ref,
  verifier_algorithm,
  policy_version,
  enabled,
  updated_at
)

GateSession(
  id_hash,
  config_version,
  created_at,
  last_seen_at,
  idle_expires_at,
  absolute_expires_at,
  revoked_at?,
  coarse_source_hash?,
  status
)

GateAttempt(
  occurred_at,
  result_class,
  source_bucket_hash,
  policy_version,
  request_id
)
```

`GateAttempt` never stores the submitted passcode, derived verifier, cookie, exact user-entered length, request body, or a value that permits offline guessing.

## Deployment setup and secret representation

1. Deployment starts locked when no gate verifier is configured. There is no default, sample, fallback, or development passcode in source, fixtures, logs, build output, repository history, or client bundle.
2. An authorized deployer generates a high-entropy passcode outside application logs and creates a unique random salt.
3. A vetted memory-hard password verifier produces a versioned encoded value containing algorithm, parameters, salt, and derived hash. Argon2id is preferred; scrypt is acceptable when provided by the approved runtime. Parameters are benchmarked on the target runtime and recorded in the encoded verifier.
4. Store the encoded salted verifier in the deployment secret/configuration store, referenced as `PRIVATE_GATE_VERIFIER`. It is never a public/client-prefixed variable.
5. Store the independently generated session-signing or server-session secret as `PRIVATE_GATE_SESSION_SECRET`; never derive it from the passcode.
6. Startup validates encoding, supported parameters, and secret presence without printing either value. Invalid/missing configuration keeps all protected routes locked and marks health as configuration-failed without revealing secret material.
7. Rotation replaces the verifier with a new version, revokes every existing gate session, and records only configuration version/time/reason. There is no endpoint that returns the verifier or passcode.

A plaintext secret injected only at process startup is less desirable because it remains reusable. If the deployment platform cannot accept the encoded verifier directly, a one-time deployment setup step may derive it before application traffic starts, must not log shell history/output, and must discard plaintext immediately. That path requires separate operational approval.

## Passcode policy

**INFERRED safety defaults:** use a randomly generated passphrase/passcode with at least 80 bits of entropy; permit at least 64 characters and spaces; never silently truncate; compare only through the verifier library’s constant-time verification path. A short numeric PIN, venue name, repository name, common phrase, or reused account password is prohibited.

The UI calls it a “Temporary private-build passcode” and displays:

> This shared gate is for a private test build only. It does not identify individual users and is not approved for production or sensitive data.

Do not display password-strength hints that reveal policy differences after submission. The failure response is always the same whether the passcode, configuration, session, or source bucket is invalid.

## Attempt controls

Enforce limits in a shared server-side/edge store so multiple instances cannot reset the budget.

| Bucket | Default limit | Result |
|---|---:|---|
| Source IP/prefix | 5 failures per 15 minutes | `429` with bounded `Retry-After` |
| Coarse browser/source tuple | 5 failures per 15 minutes | `429` |
| Deployment aggregate | 50 failures per 15 minutes | Temporarily stop verification, alert operator |
| Successful session creation | 10 per source per hour | Require expiry/reuse of current session |

Production-equivalent numerical policy is not implied; these are private-build safety defaults. Failed attempts use progressive delay with jitter. A successful attempt clears only the relevant source failure counter, never the aggregate security history. Configuration errors do not consume expensive verification repeatedly.

Responses must not reveal whether the verifier exists, which bucket fired, expected length, algorithm, or secret version. Use a fixed generic error and broadly comparable timing. Do not use a client-only limiter.

## Session contract

On successful verification:

- Create at least 128 bits of cryptographically random session entropy.
- Prefer an opaque server-side session whose bearer value is stored only as a keyed hash. A signed/encrypted cookie is acceptable only if revocation/version checks remain server-side.
- Send the bearer only in a `__Host-` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and no `Domain`.
- Never put it in URLs, local storage, analytics, error reports, or application logs.
- Default idle expiry is 30 minutes and absolute expiry is 8 hours; server-side enforcement controls both.
- Rotate the bearer after successful entry and whenever gate configuration/version changes.
- Logout revokes the session. Verifier rotation, emergency lock, or deployment reset revokes all sessions.
- Protect state-changing browser requests with same-origin validation and CSRF protection in addition to SameSite cookies.

A gate session grants only `PRIVATE_BUILD_ACCESS`. It does not assert a `User`, Owner, VenueManager, FinanceManager, Cashier, approver, or MFA assurance level.

## Authorization restrictions during the temporary phase

The application may render representative Owner/VenueManager workflows for evaluation, but must not claim the gate authenticated that role. Until individual authentication is implemented:

- Disable production payments and refunds, customer-data migration, sensitive exports, integration-secret changes, role/user administration, provider-account changes, support impersonation, and externally delivered messages.
- Keep Yellow Dog, Splash Radio, Resend, Stripe production credentials, ROLLER writes, and other external mutation adapters disabled.
- Use synthetic or explicitly approved non-sensitive fixtures only.
- Label audit actor as `private_gate_session`, never a person. Do not represent its actions as attributable approval.
- Do not satisfy dual approval, step-up, legal consent, financial authorization, or staff accountability with this gate.
- Do not enable offline cached operator grants from this shared gate.

If any restricted capability is required before the later authentication phase, stop and obtain a new owner/security decision; do not silently expand the gate.

## API and error contract

| Method/route | Behavior |
|---|---|
| `POST /api/v1/private-gate/session` | Accept one bounded `passcode` field over HTTPS; apply limits; verify; create session or return generic failure. |
| `GET /api/v1/private-gate/session` | Return only `{authenticated, idleExpiresAt, absoluteExpiresAt}` for the current cookie. |
| `DELETE /api/v1/private-gate/session` | Revoke current session and clear cookie; idempotent. |
| `POST /api/v1/private-gate/lock` | Deployment/operator-only internal action to increment gate version and revoke all sessions; not exposed to ordinary gate sessions. |

Use `application/problem+json` with stable codes:

- `PRIVATE_GATE_AUTHENTICATION_FAILED` (`401`)
- `PRIVATE_GATE_RATE_LIMITED` (`429`)
- `PRIVATE_GATE_CONFIGURATION_REQUIRED` (`503`, same public wording as unavailable)
- `PRIVATE_GATE_SESSION_REQUIRED` (`401`)
- `PRIVATE_GATE_FORBIDDEN_CAPABILITY` (`403`)

Request bodies are schema-bounded and excluded from logging. No endpoint creates, reveals, resets, emails, or downloads a passcode.

## Audit and observability

Record successful/failed/rate-limited attempts, session creation/revocation/expiry, verifier configuration-version changes, global lock, and forbidden-capability denials. Include UTC time, result class, request/correlation ID, policy/config version, and a privacy-reviewed coarse source hash. Never record submitted passcodes, verifiers, salts as separate fields, cookies, exact request bodies, or high-cardinality fingerprinting data.

Alert on aggregate threshold, repeated distributed failures, configuration loss, verifier decode error, session-version mismatch spikes, forbidden capability attempts, and unexpected public indexing/exposure. Logs do not turn a shared session into a named actor.

## Acceptance tests

1. **AT-GATE-001 — locked default:** with no configured verifier, every protected route remains locked and no default/sample passcode works.
2. **AT-GATE-002 — repository scan:** source, fixtures, build output, logs, examples, and history contain no passcode or usable verifier.
3. **AT-GATE-003 — verifier storage:** configured state contains only a versioned salted memory-hard verifier and secret references; the client bundle receives neither.
4. **AT-GATE-004 — valid entry:** correct passcode creates exactly one short-lived secure session and never appears in logs/traces.
5. **AT-GATE-005 — generic failure:** wrong passcode, absent config, malformed input, and revoked version do not reveal which condition occurred.
6. **AT-GATE-006 — rate limit:** the sixth failed source attempt inside 15 minutes performs no verifier work and returns bounded `429`; aggregate limits work across instances.
7. **AT-GATE-007 — concurrency:** concurrent successful submissions do not bypass session limits or produce predictable/reused tokens.
8. **AT-GATE-008 — cookie safety:** cookie is `__Host-`, Secure, HttpOnly, SameSite=Strict, host-only, and absent from URLs/local storage.
9. **AT-GATE-009 — expiry/revocation:** idle, absolute, logout, rotation, and global-lock transitions invalidate server-side access immediately.
10. **AT-GATE-010 — CSRF/origin:** cross-origin protected mutations fail even with a valid cookie.
11. **AT-GATE-011 — capability ceiling:** production payment/refund/export/migration/secret/admin/external-send paths return `PRIVATE_GATE_FORBIDDEN_CAPABILITY`.
12. **AT-GATE-012 — no identity claim:** UI, API, audit, and reports never label a gate session as Owner/VenueManager or as an individual approver.
13. **AT-GATE-013 — secret rotation:** replacing verifier/version revokes all prior sessions and accepts only the new passcode.
14. **AT-GATE-014 — failure safety:** limiter/store/verifier/session-service outage fails closed without exposing configuration.

## Later authentication phase — recommended, not approved for initial implementation

A future owner decision under `OQ-024` must define when the system leaves private-build status and selects individual identities, role attribution, invitations, recovery, session policy, MFA factors, step-up/dual approval, Resend domain/delivery, retention, and support procedures.

Recommended later direction:

1. Individual `User` identities with scoped role bindings and attributable audit.
2. Passkeys/WebAuthn as the preferred phishing-resistant privileged authenticator.
3. TOTP as an interoperable fallback, with recovery codes and tested recovery.
4. Resend for verified-email and security-message transport only; delivery never becomes authentication truth.
5. Step-up and separate human approval for high-risk financial/security actions.
6. Migration from shared gate sessions by invalidating all gate sessions; never convert a gate session into an individual authenticated session.

None of these later capabilities may be partially enabled behind the shared passcode without a new approved requirement, threat model, and acceptance gate.
