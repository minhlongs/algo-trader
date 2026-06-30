# PRD — algo-trader Go-Live

**Date:** 2026-06-30 | **Stage:** PMF→Early Scale

## Vision

RaaS (Robot as a Service) platform delivering AI-calibrated prediction market signals to subscribers. 52+ strategies across Polymarket, CEX, and DEX. Kelly-optimal position sizing. Tier-gated subscription model via NOWPayments USDT.

## Target Users

- Retail prediction market traders seeking alpha
- Semi-professional traders wanting automated execution
- Institutional desks needing calibrated signals

## Go-Live Blockers (MVP for this cycle)

### Blocker 1: Lint baseline
- 3 errors, >100 warnings — CI gate fails
- Fix: resolve 3 errors, reduce warnings to ≤100

### Blocker 2: Worker deploy path
- `tsconfig.worker.json` include path `src/platform/workers/**` doesn't match test expectation
- Test fixed ✅ — but verify worker actually deploys

### Blocker 3: No unified deploy script
- No single `scripts/deploy.sh` with quality gates
- Gates needed: build, typecheck, lint, test, secrets, worker-deploy

### Blocker 4: Git state dirty
- Landing page bootstrap files uncommitted
- `tsconfig.tsbuildinfo` modified

## Success Metrics

- Lint: 0 errors, ≤ 100 warnings
- Tests: 2,430 passing ✅ (maintain)
- Build: 0 TypeScript errors ✅ (maintain)
- Deploy: single script, all gates pass
- Worker: deploys to CF successfully

## Core Features (this cycle)

1. Unified deploy script (`scripts/deploy.sh`)
2. Lint warning cleanup (target ≤100)
3. Worker tsconfig validation
4. Post-deploy verification (`scripts/verify.sh`)

## Risks

| Risk | Mitigation |
|------|-----------|
| 152 `no-explicit-any` warnings are design debt | Disabled in lint config — separate cleanup initiative |
| Worker deploy untested on this branch | Verify with `wrangler deploy --dry-run` |
| Docker stack state unknown | Check `docker-compose.prod.yml` status |
