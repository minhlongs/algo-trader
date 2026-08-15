# Next Steps — Brainstorm Report

**Date:** 2026-08-13
**Status:** 📋 Ready for planning phase

## Outcome
All 5 Quick Win + 5 Medium-Term OmniRoute patterns implemented and verified:
- Hard Rule guard hook (32 tests pass)
- Quality ratchet in CI (Gate 8)
- 12 agents simplified to AGENTS.md single source of truth
- Error response regression tests (49 tests pass)
- H11 worktree isolation Hard Rule
- 81 new tests pass, 0 regressions

## Constraints
- Zero :any types in production code (Hard Rule)
- Zero console.log/warn/error — use logger utility (Hard Rule H7)
- Files under 200 lines (Hard Rule)
- kebab-case file names, self-documenting
- YAGNI > KISS > DRY
- Conventional commits only
- No AI references in commits
- Coverage must never regress below quality-baseline.json thresholds
- Hard Rule H9: Never git stash — corrupts parallel worktrees
- Hard Rule H11: Every parallel task MUST run in its own git worktree

## Non-goals
- Full pre-commit hook enforcement (planned for future phase)
- Agent skill catalog restructuring (separate initiative)
- Deployment pipeline changes (separate CI concern)
- Documentation overhaul beyond what's needed for AGENTS.md references

## Acceptance Criteria (evidence of completion)
- [x] Hard-rule-guard tests: 32/32 pass
- [x] Error regression tests: 49/49 pass
- [x] All 12 agents reference AGENTS.md (0 duplicates of concision/sills catalog rules)
- [x] CI gate-8 quality ratchet YAML present and valid
- [x] Worktree clean check: all worktrees clean
- [x] Git push complete to feat/bootstrap-quality-pipeline branch

## Material Gaps / Future Work (not absorbed by this delivery)

| Priority | Gap | Reason it's out of scope |
|----------|-----|-------------------------|
| Medium | Pre-commit Hard Rule enforcement hook | Requires designing rule parser + CI integration — separate medium-term effort |
| Low | Agent Skills Catalog (structured SKILL.md) | OmniRoute REST API overkill for algo-trader; not relevant to current patterns |
| Low | Error response regression tests expansion | 49 tests cover all critical paths; additional test types can be added later |
| Low | Worktree lifecycle documentation | No dedicated docs/worktrees.md exists; can be created as separate documentation task |
| Low | Automated worktree cleanup mechanism | Reports mention 10-min cleanup script but not implemented; not part of this delivery |

## Recommended Next Steps (Plan Mode)

### Option A: Pre-commit Hard Rule Enforcement (High Impact)
- Design rule parser that reads AGENTS.md Hard Rules
- Add pre-commit hook to validate commits against H1-H11
- Update CI to gate on pre-commit validation
- **Estimate:** 1 day effort

### Option B: Worktree Documentation (Low Impact)  
- Create `docs/worktrees.md` with guidelines, naming conventions, cleanup procedures
- **Estimate:** 2-3 hours effort

### Option C: Agent Skill Catalog Refresh (Optional)
- Update agent definitions to reference new AGENTS.md format
- Remove any remaining stale references
- **Estimate:** 30 min effort (already completed for 12 agents)

### Option D: Quality Baseline Update
- If genuine metric improvement verified, update quality-baseline.json thresholds
- Run `npm run quality:ratchet -- --update` to raise floor
- **Estimate:** Only if real improvement verified

## Unresolved Questions
- Should pre-commit Hard Rule enforcement be the next delivery?
- Who owns worktree documentation for the team?
- Is the quality baseline at optimal floor, or should thresholds be raised?

**Recommendation:** Start with Option A (Pre-commit enforcement) as it's the highest-impact remaining item from the OmniRoute pattern mapping. This completes the enforcement layer that was the biggest gap identified in the original mapping.