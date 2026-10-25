# Phase 06 — Rollout Doc Truth Reconciliation

## Context Links
- Plan: [`../plan.md`](../plan.md)
- Depends on: [`phase-02-health-contract-reconciliation.md`](phase-02-health-contract-reconciliation.md), [`phase-03-final-integration-check-host-correction.md`](phase-03-final-integration-check-host-correction.md)

## Overview
- **Priority:** P1 (documentation)
- **Current status:** pending
- **Goal:** make `docs/production-rollout-plan.md` describe the *actual* state — done items checked with
evidence, unbuilt items explicitly marked not-done with reasons, so a reader can trust the checkbox list.

## Key Insights
- The doc currently over-claims: technical readiness is checked (scaling phases, CI, monitoring) while
every operational item and every pre-deployment success criterion is unchecked. The contrast makes the
doc read as more ready than reality.
- Multi-region is claimed in tooling (`final-integration-check.js` names 3 regions) but the live topology is
**one** Worker behind one route. Docs and tooling must agree that multi-region is *unbuilt*, not silently dropped.

## Requirements
- Every newly-satisfied gate gets checked **with a link to its evidence file**.
- Gates that remain unsatisfied are labeled "NOT DONE — <reason>, <date>" rather than left ambiguously empty.
- Multi-region status stated plainly in one place.

## Architecture
Doc-only. Localize the truth in one table so future waves update one row, not ten scattered lists.

## Related Code Files
- **Modify:** `docs/production-rollout-plan.md`
- **Modify:** `docs/development-roadmap.md` / `docs/project-changelog.md` (append the go-live entry)
- **Read only:** `plans/261020-1345-golive-zero-bug/evidence/*` for the numbers to cite

## Implementation Steps
1. Read the doc fully; build a claim → evidence → status table.
2. Check items now genuinely done (Phase 01's four gates, Phase 02's health contract, Phase 03's verifier fix).
3. Mark honestly-not-done items with a reason and date (multi-region, 12k if it fails).
4. Insert a single "Current topology" paragraph: 1 Worker, route `api.cashclaw.cc/*`, plus the static Pages site.
5. Cross-check `docs/ai-first-enforcement-gates.md`'s Gate 5 row is now described accurately (it was already healthy).
6. Append a changelog entry with the plan path.

## Todo List
- [ ] Claim → evidence table written
- [ ] Satisfied items checked with evidence links
- [ ] Unsatisfied items labeled with reason + date
- [ ] Topology statement present
- [ ] Changelog entry added
- [ ] Contradictions between doc, wrangler config, and tooling removed

## Success Criteria
- No checkbox in the doc is ambiguous — every box is either checked-with-evidence or flagged with a stated reason.
- A fresh reader can answer "is this ready for production, and what exactly is missing?" from the doc alone.

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Truth-telling looks like regression to a stakeholder | Medium | Frame as discovery: the gaps were always there, previously invisible |
| Doc drift returns in the next wave | Low | Requirement that evidence links accompany checks; enforcement in Phase 08 readout |

## Security Considerations
- Docs must not gain accidental secrets (tokens, hostnames with credentials).

## Next Steps
→ Phase 07 repairs the ME harness gate verifier so the gate states reflect the executed reality.

## Unresolved Questions
- None.
