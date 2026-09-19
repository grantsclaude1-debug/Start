# Operator UI Rendered Walkthrough Checklist

This checklist verifies the dependency-free synthetic operator preview. Use loopback only with temporary generated gate credentials. Never activate report links or any disabled integration/payment boundary.

## Authentication and global boundaries

- [ ] Logged-out desktop and mobile layouts render without overflow.
- [ ] Persistent top banner, sign-in boundary note, footer, and authenticated ephemeral strip identify non-production synthetic per-instance state.
- [ ] Empty, short, and incorrect passcodes show safe generic failure; correct temporary passcode enters the console.
- [ ] Focus moves to the first visible view heading after login and back to the sign-in heading after logout.
- [ ] Logout revokes the session; refresh remains logged out.
- [ ] Loading state is announced and no unauthenticated background state request occurs.

## Overview

- [ ] Overview navigation state and page title are synchronized on desktop sidebar, mobile selector, and URL hash.
- [ ] Total, blocked, held, confirmed, and available metrics render with text labels, not color alone.
- [ ] Empty holds table has an explanatory state.
- [ ] Refresh updates state, announces completion, and cannot be double-submitted.

## Sample sale

- [ ] Product and quantity fields have labels, help, keyboard focus, and native range validation.
- [ ] A valid hold updates capacity and enables confirmation; refresh recovers the active hold.
- [ ] Invalid and over-capacity holds show errors without stale success text.
- [ ] Confirmation produces an order and ticket while visibly stating that no payment was collected.
- [ ] Confirmation cannot be double-submitted and the payment/provider boundary remains disabled.
- [ ] A consumed or stale hold fails safely and state recovers.

## Admissions

- [ ] Empty ticket and admissions states are useful.
- [ ] Issued ticket displays a non-scannable decorative pattern and an explicit scanner warning.
- [ ] First check-in succeeds; duplicate/over-limit check-in returns a visible conflict outcome.
- [ ] Check-in mutation locks while pending and server state remains visible after conflict.

## Reports

- [ ] Every report title and purpose renders.
- [ ] Authenticated CSV and JSON report links remain present and clearly synthetic.
- [ ] No report link is activated during verification.

## Readiness

- [ ] Offline outbox is labeled local and ephemeral.
- [ ] Yellow Dog is read-only and its sale queue is disabled.
- [ ] Splash Radio is manual-only.
- [ ] Migration is read-only with source writeback prohibited.
- [ ] Payment card entry, authorization, capture, refund, webhook, Terminal, and provider calls are disabled.

## Responsive, keyboard, console, and network

- [ ] Repeat every view at wide desktop and narrow mobile widths.
- [ ] Tab order follows visual order; all controls and report links are reachable; focus indicators are visible.
- [ ] No content overlaps or creates unintended horizontal page scrolling.
- [ ] Reduced-motion and forced-colors fallbacks remain usable by inspection.
- [ ] Console has no uncaught errors or missing-asset noise after meaningful flows.
- [ ] Network log contains only loopback same-origin static/API requests; expected auth/conflict responses are explained and no external/provider requests occur.
- [ ] After fixes, repeat the complete walkthrough, stop the server, remove temporary credentials/artifacts, and prove the loopback listener is gone.
