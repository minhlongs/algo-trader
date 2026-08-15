# algo-trader agent guide

> **Single source of truth.** This file holds ALL project rules, conventions, architecture notes
> and Hard Rules for every AI assistant working this repository. `CLAUDE.md` only adds
> assistant-specific deltas and points back here. Change rules HERE only.

## Quick Start

```bash
bun install                     # Install deps
bun run dev                     # Dev server
bun run build                   # Production build
bun run test                    # Run all tests (vitest)
bun run lint                    # ESLint (0 errors expected)
```

## Project Overview

Crypto trading platform. TypeScript/Node.js. Cloudflare Workers primary deployment.
Multi-exchange support via CCXT. RSI+SMA strategy engine with backtesting.
Durable Objects for state. D1 for persistence. Multi-region: us-east, eu-central, ap-southeast.

## 11 Hard Rules (Non-Negotiable)

| # | Rule | Test |
|---|------|------|
| H1 | Never commit secrets, API keys, wallet addresses, or credentials | `git diff --cached` must not contain `.env`, keys, tokens, wallet addr |
| H2 | Never use `eval()` / `new Function()` / implied eval | ESLint `no-eval`, `no-implied-eval`, `no-new-func` = error |
| H3 | Never commit directly to main — always use feature branches | Branch name must not be `main` at commit time |
| H4 | Never return raw `err.stack` or `err.message` in HTTP responses | Use `sanitizeHttpError` from `@/shared/utils/error-sanitize`; error responses sanitized |
| H5 | Zod-validate every API input; reject bad input early | All route handlers have Zod schema; unknown fields stripped |
| H6 | Every fix starts with a failing test (TDD) | New test committed before or with the fix |
| H7 | Fix touch ONLY files the test proves broken | No drive-by refactors in a bug-fix commit |
| H8 | `npm run build` → 0 TypeScript errors | CI gate must pass |
| H9 | `npm test` → all tests pass | CI gate must pass |
| H10 | Coverage ≥ 80% statements, 80% lines, 80% functions, 80% branches | vitest threshold enforced |
| H11 | Zero `:any` types in production code | ESLint `@typescript-eslint/no-explicit-any` = error |

## Code Quality

- **Zero** `console.log`/`console.warn`/`console.error` — use logger utility
- try/catch with specific error types; log with context
- Fix failing tests, never ignore or skip them to pass build
- Error sanitization: never expose stack traces in production responses (`@/shared/utils/error-sanitize`)
- Logger utility for all output; no raw error objects in responses
- Deploy commands: `wrangler deploy` + region scripts
- Rollback: kill-switch endpoints on `/api/admin/rollback/kill/`

## Agent Conventions

- Every agent **MUST** read this file before starting work
- Reports saved to `plans/reports/`
- Sacrifice grammar for concision in reports
- List unresolved questions at end of every report
- Delegate: planner → code → tester → code-reviewer → docs-manager

## Protected Flows (DO NOT BREAK)

1. **Setup Wizard** — BYOK onboarding (API keys, exchanges)
2. **Telegram Bot** — @Sophia_Bbot commands (`/campaign`, `/status`, `/results`)
3. **Payment Flow** — NOWPayments IPN webhook → tier activation

## Error Response Pattern

```typescript
import { sanitizeHttpError } from '@/shared/utils/error-sanitize';

catch (err) {
  return NextResponse.json(sanitizeHttpError(err), { status: 500 });
}
```

## Commit Convention

- `feat:` new feature
- `fix:` bug fix
- `test:` adding tests
- `refactor:` code change that neither fixes a bug nor adds a feature
- `docs:` documentation only
- `chore:` maintenance tasks
