# Phase 03 — Verifier Host/Path Correction (`final-integration-check.js`)

## Context Links
- Plan: [`../plan.md`](../plan.md)
- Depends on: [`phase-02-health-contract-reconciliation.md`](phase-02-health-contract-reconciliation.md)

## Overview
- **Priority:** P0 (tooling)
- **Current status:** pending
- **Goal:** make every path in `scripts/final-integration-check.js` point at a host/path that exists and is meaningful.

## Key Insights
- `scripts/final-integration-check.js` probes 4 endpoints across 3 "regions" — but all 3 region
  entries map to the **same non-resolving hostname** `algo-trader.workers.dev` (`curl` exit 6, DNS fail).
  So the script cannot have ever passed as written. It is a broken verifier, not evidence of a broken system.
- **Gate 5 (`scripts/ci-gate-deploy-smoke.mjs`) is healthy and must NOT be touched.** Re-verified 2026-10-20:
  `https://algo-trader.pages.dev` → HTTP 200, `https://cashclaw.cc` → HTTP 200. Both smoke targets pass.
  An earlier draft of the plan wrongly grouped Gate 5 into this phase.
- The real API host is `https://api.cashclaw.cc` (`wrangler.toml:94-96`, route `api.cashclaw.cc/*`,
  zone `cashclaw.cc`). `/api/version` on it returns `{"sha":"bca78f2e...","service":"algo-trader","arch":"cf-only"}`.
- `/api/v1/shard/ring` returns **401** because it *requires auth* (`edge-proxy.ts:114`). A health probe
  with no credentials can never get 200. The script must either use a probe token from the environment
  or stop treating ring-shape as a liveness check.

## Requirements
- No probe in the script targets a non-resolving hostname.
- Each probe targets a path the Worker actually routes.
- "3 regions" is either reduced to the real topology (1 region) or parameterized via env for a
  future multi-region build — no fabricated region entries.
- Failure semantics preserved: non-2xx → non-zero exit.

## Architecture
Parameterize the script with an env-var for the base URL (default the live API host), and separate
`apiHealth` (auth-free) from `shardRing` (auth-required) so a 401 is reported as "auth-required, expected"
rather than a silent failure or a false pass.

## Related Code Files
- **Modify:** `scripts/final-integration-check.js` (host map + endpoint table + auth handling)
- **Modify:** `scripts/verify-multi-region.sh` (only if it shares the same hostname assumption)
- **Read only:** `.github/workflows/load-test.yml`, `scripts/verify-deploy.sh` (check for the same wrong-host assumption and note them)

## Implementation Steps
1. Replace the `REGION_WORKER_NAMES` map so every region resolves to the real API host (or a single default plus an env override).
2. Point `health` at the path chosen in Phase 02 (`/api/health` or `/health`) and `regionHealth` likewise.
3. For `shardRing`, either require `$SHARD_RING_TOKEN` in the environment or mark it `auth: true` and exit non-zero only when the status is not in `{200, 401}`.
4. Add a pre-flight DNS/`curl` check that fails fast with a clear message if the target host does not resolve — so a future misconfiguration fails loudly, not silently.
5. Run the script against the live host; capture the result to `plans/261020-1345-golive-zero-bug/evidence/final-integration-check.txt`.
6. Shellcheck any `.sh` touched (Gate 7 runs `shellcheck --severity=warning`).

## Todo List
- [ ] Hosts all resolve
- [ ] Endpoints match Phase 02's chosen contract
- [ ] shardRing auth handling explicit
- [ ] Pre-flight reachability check
- [ ] Script run recorded as evidence
- [ ] Gate 5 (`ci-gate-deploy-smoke.mjs`) untouched — confirm by diff

## Success Criteria
- `node scripts/final-integration-check.js` exits with a **meaningful** status against `api.cashclaw.cc`.
- Re-run twice: result is stable and idempotent.
- `git diff scripts/ci-gate-deploy-smoke.mjs` is empty (proves Gate 5 was left alone).

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Turning a broken probe green without fixing the system (greenwashing) | **High** | Phase 02 must land first; this phase only redirects probes to *correct* targets. Verify `/api/health` returns 200 independently before trusting the check |
| Multi-region claim silently weakened | Medium | Explicitly mark multi-region as unbuilt in Phase 06; do not delete the region list silently |
| Auth token introduced in CI and leaked | Medium | Token only from `$SHARD_RING_TOKEN`; never echoed; add to `.gitignore` discipline |

## Security Considerations
- Do **not** hardcode a shard-ring token.
- The pre-flight must not print response *bodies* of authenticated endpoints.
- Keep the script read-only; no mutation probes.

## Next Steps
→ Phase 04 parameterizes the load test; 05 executes it.

## Unresolved Questions
- Should the ring probe require a token in CI, or should the go-live readout simply not gate on it? Recommend: don't gate on ring-shape for liveness; treat it as a separate authenticated monitoring job.
