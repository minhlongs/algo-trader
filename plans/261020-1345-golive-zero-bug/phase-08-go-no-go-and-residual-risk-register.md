# Phase 08 — Go/No-Go Decision & Residual-Risk Register

## Context Links
- Plan: [`../plan.md`](../plan.md)
- Depends on: [`phase-05-load-test-execution-and-evidence.md`](phase-05-load-test-execution-and-evidence.md), [`phase-07-harness-gate-repair-and-evidence.md`](phase-07-harness-gate-repair-and-evidence.md)

## Overview
- **Priority:** P0 — the deliverable the whole plan exists to produce
- **Current status:** pending
- **Goal:** a one-page go/no-go verdict against every CLAUDE.md deploy blocker, plus an honest
residual-risk register. This is the answer to "how to go live zero bug."

## Key Insights
- CLAUDE.md's blockers are: scaling phases 1-11 complete, integration tests passing,
  **load test 12k RPS validated**, **ME IDEA PSF gate approved (`/mekong gates`)**, on-call engineer notified.
- "Zero bug" is not achievable as an absolute. The defensible claim is:
  **zero known bugs against asserted contracts + bounded blast radius + explicit residual risk.**
- An honest NO-GO with a named 3-item punch list is worth far more than a green claim resting on a
verifier that probes the wrong host — which is precisely what the plan started with.

## Requirements
- Every CLAUDE.md blocker gets a verdict (PASS / FAIL / N/A with reason) and an evidence link.
- Residual risks listed with likelihood × impact and the mitigations accepted.
- The readout must be readable without opening any other file.

## Related Code Files
- **Modify:** none
- **Create:** `plans/261020-1345-golive-zero-bug/go-no-go.md` (the verdict)
- **Create:** `plans/261020-1345-golive-zero-bug/evidence/verdict.md` (command outputs backing each row)
- **Read only:** everything in `plans/261020-1345-golive-zero-bug/`

## Implementation Steps
1. Re-run the four static gates and record exit codes.
2. Probe production live and record status codes for the full endpoint table.
3. Run `me solo gates verify --strict` and record.
4. Attach Phase 05 load-test numbers.
5. Build the deploy-blocker table with verdicts + evidence links.
6. Write the residual-risk register:
   - routes never exercised by load test or e2e
   - third-party dependencies (NOWPayments, OpenRouter, CCXT venues, Polymarket CLOB)
   - CF platform limits surfaced during Phase 05
   - the 65-file modularization delta riding along in the deploy
   - multi-region unbuilt (if Phase 06 concludes it is not attempted)
7. State the verdict: **GO / NO-GO / CONDITIONAL GO** with the exact conditions.

## Todo List
- [ ] Deploy-blocker table with verdicts + evidence
- [ ] Residual-risk register with likelihood × impact
- [ ] Single-sentence verdict plus conditions
- [ ] Rollback plan re-stated (L1 kill-switch URLs from CLAUDE.md) so a GO is reversible
- [ ] Phase state file updated to `completed`

## Success Criteria
- Every row of the CLAUDE.md blocker list has a verdict and an evidence link.
- The verdict sentence is falsifiable: if any condition is unmet, the verdict is not GO.
- A NO-GO without a punch list counts as failure to deliver this phase.

## Rollback (re-stated for a GO)
```bash
curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/SHARDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```
Note: these CLAUDE.md targets use the **non-resolving** `algo-trader.workers.dev` host — correct the
hostname to `api.cashclaw.cc` in the same change that fixes `final-integration-check.js`, or a real
rollback instruction will not work during an actual incident.

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Verdict drift (claiming GO without meeting a condition) | Falsifiable criteria, every condition linked to recorded output |
| Rollback instructions unusable during incident | Hostname corrected before GO is issued |

## Security Considerations
- The verdict file is safe to share internally (no secrets). Keep `$ADMIN_TOKEN` out of any doc.

## Next Steps
→ Hand to the `ship` phase (`/binh-phap ship`) once verdict is GO or CONDITIONAL GO.

## Unresolved Questions
- None, provided Phases 02–07 landed.
