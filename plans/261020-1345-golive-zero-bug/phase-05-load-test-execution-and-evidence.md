# Phase 05 — Load-Test Execution & Evidence (12k RPS, 30m)

## Context Links
- Plan: [`../plan.md`](../plan.md)
- Depends on: [`phase-04-load-test-gate-parameterization.md`](phase-04-load-test-gate-parameterization.md), [`phase-02-health-contract-reconciliation.md`](phase-02-health-contract-reconciliation.md)

## Overview
- **Priority:** P1 — this is the single largest unexecuted gate
- **Current status:** pending (blocked on the Phase 04 host decision + Phase 02 landing)
- **Goal:** close the "12k RPS for 30m" gap with a *recorded, repeatable* run.

## Key Insights
- CLAUDE.md explicitly blocks deploy without "load test 12k RPS validated". Today that gate is
  asserted in docs but never executed — the k6 script defaults to 5,000 VUs.
- This is the only phase that takes meaningful wall-clock time (~30 minutes) and real infrastructure risk.
- A CF Worker without a paid plan or with burst limits may legitimately fail 12k RPS for **commercial/account**
  reasons rather than code reasons. That outcome still needs honest reporting — it just changes which
  decision the user faces (upgrade plan vs. fix code vs. lower the target).

## Requirements
- A completed 30-minute run against the agreed host, producing `reports/load-test/` JSON output.
- Pass/fail decided against Phase 04's thresholds (p95<100ms, error rate<1%) **plus** achieved RPS ≥ 12k.
- The run recorded as evidence lines, not prose.

## Architecture
Execution + evidence only. No code changes.

## Related Code Files
- **Modify:** none
- **Create:** `plans/261020-1345-golive-zero-bug/evidence/load-test-run.md` (summary + raw k6 tail)
- **Output artifact:** `reports/load-test/`

## Implementation Steps
1. Confirm the Phase 04 host decision. Announce the window.
2. Pre-check: the target responds 200 and `/api/version` returns the expected SHA.
3. Run with explicit params — do not rely on defaults:
   ```bash
   k6 run -e TARGET_RPS=12000 -e VUS=12000 \
     tests/load/raas-gateway-load-test.js
   ```
4. Watch for the first 5 minutes; abort on systematic non-2xx (503/429 chains will just burn the window).
5. Save stdout + the JSON artifact into `evidence/`.
6. Record: total requests, achieved RPS, p95, error rate, and whether each threshold held.

## Todo List
- [ ] Host decision confirmed and window announced
- [ ] Pre-check 200 + expected SHA
- [ ] 30-minute run executed
- [ ] Raw k6 output + JSON artifact captured into `evidence/`
- [ ] Pass/fail recorded against all three metrics (RPS, p95, errors)

## Success Criteria
- `evidence/load-test-run.md` contains actual measured numbers (not copied expectations).
- Every one of the three metrics (RPS, p95, error rate) is explicitly reported.
- A re-run reproduces within a stated tolerance.

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Load test harms live customers | **High** | Target staging or a low-traffic window; abort policy defined up-front |
| Result is commercially limited (CF plan), not a code defect | Medium | Report which entity limited it, so the user can choose to upgrade |
| 30m run wasted on a wrong-host test | Medium | Phase 04 smoke run (30s) validates plumbing first |

## Security Considerations
- Read-only endpoints only. No credential-bearing requests. Abort if the test accidentally reaches a write route.

## Next Steps
→ Phase 06 reconciles the docs, using this measured result as the source of truth.

## Unresolved Questions
- Target host for the real run (production vs staging vs preview) — see Phase 04.
