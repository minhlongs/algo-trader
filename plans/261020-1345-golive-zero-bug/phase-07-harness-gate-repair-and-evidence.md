# Phase 07 — Harness Gate Verifier Repair & Fresh ME Evidence

## Context Links
- Plan: [`../plan.md`](../plan.md)
- Depends on: [`phase-06-rollout-doc-truth-reconciliation.md`](phase-06-rollout-doc-truth-reconciliation.md)

## Overview
- **Priority:** P1
- **Current status:** pending
- **Goal:** make `/mekong gates` (the CLAUDE.md-mandated approval gate) actually work, and record fresh
Oct-2026 evidence artifacts.

## Key Insights
- `bash ~/Documents/me-deep-wrapper/bin/me solo gates verify --strict` aborts:
  `reconcile_goal_gate_state: command not found` — function called at `bin/me:1466` and again at
  `bin/me:1484`, **never defined anywhere**.
- Non-strict (`me solo gates verify`) exits 0. So the bug is confined to the strict/reconcile path.
- Evidence artifacts DO exist under `~Documents/me-deep-wrapper/state/evidence/` with
  `status: passed|ready` — but Aug/Sep 2026 timestamps, printed as a contradictory `MISS` by strict mode.
- **CLAUDE.md's deploy blocker explicitly names `/mekong gates`.** A verifier that cannot run
  cleanly means this gate is currently unverifiable — the go-live readout must state this, not paper over it.
- `me-deep-wrapper` is a **separate git repo** (`github.com/minhlongs/me-deep-wrapper`); the fix is upstream
  from algo-trader.

## Requirements
- Either implement the missing `reconcile_goal_gate_state` in the wrapper repo, or documented-confirm
that gate evidence is valid by direct artifact inspection (the workable path if the repo is out of scope).
- Evidence artifacts refreshed (or timestamp-preserved with a dated review note) reflecting the Phase 01–05 outcome.
- No fabrication: a gate is passed because its contract was executed, not because a file was edited.

## Architecture
Upstream script fix (bash function) + evidence refresh. Do not touch algo-trader source.

## Related Code Files
- **Modify (upstream, separate repo):** `~/Documents/me-deep-wrapper/bin/me` — implement `reconcile_goal_gate_state`
- **Modify (if allowed):** `~/Documents/me-deep-wrapper/state/evidence/*.json`
- **Create:** `plans/261020-1345-golive-zero-bug/evidence/me-gate-verify.md` (record output of `me solo gates verify` before/after)
- **Read only:** `.claude/skills/mekong-harness/SKILL.md`

## Implementation Steps
1. Confirm which repo is authoritative for `me` and whether the user wants it edited (**decision gate**).
2. Capture current output: `me solo gates verify` and `... --strict` into `evidence/me-gate-verify.md`.
3. Implement `reconcile_goal_gate_state` in the wrapper: read gate state, reconcile against
   `state/evidence/*.json` timestamps, emit the summary **without** contradicting `MISS` markers that its
   own artifact files disprove.
4. Re-run: strict must exit 0 and print consistent statuses.
5. Refresh/write evidence artifacts for gates touched by this plan, dated 2026-10-20.
6. Re-run `/mekong gates` and record the verdict.

## Todo List
- [ ] Decision obtained on editing the wrapper repo
- [ ] Pre-fix output captured
- [ ] `reconcile_goal_gate_state` implemented (or documented workaround + direct artifact inspection)
- [ ] Strict verify exits 0 with self-consistent output
- [ ] Evidence artifacts dated Oct 2026
- [ ] Post-fix output captured

## Success Criteria
- `me solo gates verify --strict` exits 0 and prints statuses that agree with the on-disk artifacts.
- The previous `command not found` is gone.
- No gate marked passed without its evidence file being newer than the work that satisfied it.

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Editing a second repo inflates blast radius | Medium | Gate on user decision; keep the change to one function |
| Reconcile function papers over genuinely-stale gates | **High** | Function must fail loudly on missing/stale evidence, never auto-pass |
| Strict output conflicting with artifact files again | Medium | Derive `MISS` from actual artifact presence, not from an unrelated timestamp comparison |

## Security Considerations
- Evidence files must not accumulate secrets; they are plain JSON notes.
- Do not weaken gate checks to make "verify" exit 0 — that reproduces exactly the "verifier disagrees with reality" bug this whole plan exists to remove.

## Next Steps
→ Phase 08 renders the go/no-go verdict.

## Unresolved Questions
- **Blocking:** is the `me-deep-wrapper` repo in scope for editing?
