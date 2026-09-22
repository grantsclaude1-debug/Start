# Repository baseline — 2026-09-21

Recorded before implementation began. This is a read-only audit snapshot; no fetch, pull, clone, export, install, push, deploy, vendor call, or provider write occurred.

## Git baseline

- Working directory: `/Users/grantsclaude/Projects/Start`
- Branch: `main`, tracking `origin/main`
- HEAD: `cb6db3a` — `Redesign operator interface for venue use`
- Remote metadata already present locally: `origin git@github.com:grantsclaude1-debug/Start.git` for fetch/push. Neither direction was used.
- Status: one pre-existing untracked owner requirements document, `docs/implementation-acceptance-2026-09-21.md`; no tracked diff.
- Recent commits: `cb6db3a`, `fe652ac`, `cdc8953`, `8834dc0`, `2278e9e`, `0b6c103`, `440256e`, `81863fc`.

## Complete baseline tree

The audit enumerated all paths including dotfiles while excluding `.git` internals. There were 55 repository files totaling 396,717 bytes: `.gitignore`, `README.md`, `package.json`, `vercel.json`; `api/handler.js`; 26 Markdown/specification or validator files under `docs/`; `public/{index.html,styles.css,app.js}`; four scripts; 20 source modules under `src/`; and 11 test files under `test/`. The exact pre-edit tree and file sizes were captured in the task execution log. Every baseline text file was included in the content/headings/export/route/test audit.

## Baseline architecture

- Dependency-free ECMAScript modules on Node.js 24.
- One stdlib HTTP request handler shared by loopback `src/start.js` and Vercel `api/handler.js`.
- Fail-closed, temporary shared scrypt passcode gate using environment-only verifier/session secret; process-local sessions and rate limiting.
- Exact static allowlist, origin/CSRF checks, 16 KiB request limit, JSON media-type checks, security headers.
- Process-local models for capacity/holds, orders, signed synthetic tickets/check-ins, outbox, reports, a read-only Yellow Dog mirror, manual-only Splash Radio, disabled Stripe placeholder, and read-only migration records.
- Vanilla semantic HTML/CSS/JS operator UI.
- In-memory state is isolated per process/serverless instance and explicitly unsuitable for production operations.

## Baseline verification

`npm run verify` passed before edits:

- static check: 37 JavaScript files parsed, zero dependencies, network-capable imports absent, HTTP import restricted to the server/test boundary, fixture secret checks passed;
- documentation validator: passed;
- Vercel configuration validator: passed;
- Node test runner: **57/57 tests passed**, 0 failed, 0 skipped, 0 todo.

## Preserved safety invariants

- Synthetic data only; no real guest, customer, staff, payment, or vendor data.
- No raw cards or credentials in source, fixtures, logs, or browser state.
- No network/vendor calls or signed-in vendor sessions.
- ROLLER/migration and inventory boundaries are read-only; payment collection and Splash Radio actions are disabled.
- No hard-coded passcode; missing/malformed gate configuration fails before listening.
- Integer minor-unit money, capacity oversell protection, idempotency, signed ticket validation, and duplicate check-in handling.
- No claim of production durability: no shared database, distributed transaction/lock, RBAC/MFA, backup/recovery, or production integration.
