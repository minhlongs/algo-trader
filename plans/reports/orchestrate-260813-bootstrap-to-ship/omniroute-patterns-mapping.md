# OmniRoute → algo-trader Pattern Mapping

**Source:** [OmniRoute](https://github.com/diegosouzapw/OmniRoute) v3.8.50 (46.8k stars, 330+ providers, 1200+ models)
**Target:** algo-trader v1.1.0 (crypto trading platform)
**Date:** 2026-08-13

---

## Top 5 Patterns to Adopt

### 1. Hard Rules System (Impact: ⭐⭐⭐⭐⭐)

**OmniRoute pattern:** 23 non-negotiable Hard Rules in AGENTS.md — every AI agent must follow them. Rules are concrete, testable, and have precedent examples.

**algo-trader gap:** Development rules exist but are advisory, not enforced. No Hard Rules system — agents can violate guidelines without consequence.

**Action:**
- Create `AGENTS.md` with algo-trader Hard Rules (adopt + adapt from OmniRoute)
- Add enforcement hook that blocks commits violating Hard Rules
- Make rules discoverable by all agents (inject into subagent prompts)

**algo-trader Hard Rules to adopt:**
1. Never commit secrets or credentials
2. Never use eval() / new Function()
3. Never commit directly to main
4. Always validate inputs with Zod schemas
5. Always include tests when changing production code
6. Never return raw err.stack in responses — use logger utility
7. Never bypass pre-commit hooks
8. Every bug fix must have regression test
9. Never log PII (API keys, tokens, wallet addresses)
10. Coverage ratchet — never regress below baseline

**Files to modify:**
- Create: `AGENTS.md` (single source of truth for all agents)
- Modify: `.claude/hooks/pre-commit.cjs` (add Hard Rule enforcement)

---

### 2. Quality Ratchet System (Impact: ⭐⭐⭐⭐⭐)

**OmniRoute pattern:** `quality-baseline.json` freezes current coverage. CI fails if coverage drops. Updates only when genuinely improving via `npm run quality:ratchet -- --update`.

**algo-trader gap:** 80% coverage threshold in vitest.config.ts, but no ratchet mechanism. Coverage can regress silently if threshold is lowered.

**Action:**
- Create `quality-baseline.json` with current metrics (4239 tests, 99.53% pass rate, 80% coverage)
- Add CI gate that compares against baseline
- Never allow threshold decreases without explicit approval

**Files to create/modify:**
- Create: `quality-baseline.json`
- Modify: `vitest.config.ts` (add baseline comparison)
- Modify: `.github/workflows/ci.yml` (add ratchet gate)

---

### 3. Agent Self-Governance (Impact: ⭐⭐⭐⭐)

**OmniRoute pattern:** AGENTS.md is the single source of truth. All agents read it. Rules are concrete with precedent examples. No ambiguity.

**algo-trader gap:** 25+ agent definitions, but each has its own rules section. Inconsistencies between agents. No single source of truth.

**Action:**
- Create `AGENTS.md` as single source of truth
- Simplify agent definitions to reference AGENTS.md instead of duplicating rules
- Add "read AGENTS.md" instruction to every agent definition

**Before (algo-trader fullstack-developer.md):**
```markdown
## Core Responsibilities
**IMPORTANT**: Ensure token efficiency while maintaining quality.
**IMPORTANT**: Activate relevant skills from `.claude/skills/*` during execution.
**IMPORTANT**: Follow rules in `./.claude/rules/development-rules.md` and `./docs/code-standards.md`.
**IMPORTANT**: Respect YAGNI, KISS, DRY principles.
```

**After:**
```markdown
## Core Responsibilities
**CRITICAL:** Read and follow ALL rules in `AGENTS.md` — the single source of truth.
YAGNI > KISS > DRY. Token efficiency mandatory. Activate relevant skills from `.claude/skills/*`.
```

**Files to modify:**
- Create: `AGENTS.md`
- Modify: All 25+ `.claude/agents/*.md` files (simplify rules sections)

---

### 4. Error Sanitization Protocol (Impact: ⭐⭐⭐⭐)

**OmniRoute pattern:** Never return raw err.stack/err.message. Always route through `buildErrorBody()` or `sanitizeErrorMessage()`. Test that error responses don't leak stack traces.

**algo-trader gap:** Security scan found error messages leaking internal details. No centralized error sanitization.

**Action:**
- Create `src/shared/utils/error-sanitize.ts` with `sanitizeError()` function
- Add Hard Rule: never return raw errors in HTTP responses
- Add test: error responses must not contain stack traces

**Files to create/modify:**
- Create: `src/shared/utils/error-sanitize.ts`
- Modify: All API route handlers to use sanitization
- Create: `tests/unit/error-sanitize.test.ts`

---

### 5. Git Stash Ban (Impact: ⭐⭐⭐)

**OmniRoute pattern:** `git stash` banned because it operates on shared repository object store, clobbering parallel sessions. Use `git show <ref>:<path>` instead.

**algo-trader gap:** 25+ worktrees in active use. Git stash could corrupt parallel sessions.

**Action:**
- Add Hard Rule: never git stash
- Add hook that blocks git stash commands
- Document alternative: `git show <ref>:<path>` or `git diff <ref> -- <path>`

**Files to create/modify:**
- Add to: `AGENTS.md`
- Create: `.claude/hooks/git-stash-block.cjs`

---

## Quick Wins (High Impact, Low Effort)

| # | Pattern | Effort | Impact | Files |
|---|---------|--------|--------|-------|
| 1 | Create AGENTS.md as single source of truth | 1 hour | ⭐⭐⭐⭐⭐ | Create `AGENTS.md` |
| 2 | Add git stash block hook | 30 min | ⭐⭐⭐ | Create `.claude/hooks/git-stash-block.cjs` |
| 3 | Add error sanitization utility | 1 hour | ⭐⭐⭐⭐ | Create `src/shared/utils/error-sanitize.ts` |
| 4 | Create quality-baseline.json | 30 min | ⭐⭐⭐⭐ | Create `quality-baseline.json` |
| 5 | Simplify agent definitions (reference AGENTS.md) | 2 hours | ⭐⭐⭐⭐ | Modify 25+ `.claude/agents/*.md` |

---

## Medium-Term (Need Planning)

| # | Pattern | Effort | Impact | Notes |
|---|---------|--------|--------|-------|
| 1 | Pre-commit Hard Rule enforcement | 1 day | ⭐⭐⭐⭐⭐ | Need to design rule parser |
| 2 | Coverage ratchet in CI | 1 day | ⭐⭐⭐⭐⭐ | Need baseline measurement first |
| 3 | Agent Skills Catalog (structured SKILL.md) | 2 days | ⭐⭐⭐ | OmniRoute has REST API for discovery — overkill for algo-trader |
| 4 | Error response regression tests | 1 day | ⭐⭐⭐⭐ | Test that no endpoint leaks stack traces |
| 5 | Worktree isolation enforcement | 1 day | ⭐⭐⭐ | Already using worktrees, need Hard Rule |

---

## Skip (Not Applicable to algo-trader)

| Pattern | Reason |
|---------|--------|
| Combo routing (19 strategies) | OmniRoute-specific LLM routing — not relevant to trading |
| Quota-aware scheduling | OmniRoute-specific provider management |
| Release-freeze mechanism | OmniRoute has parallel release cycles — algo-trader doesn't |
| Agent Skills REST API | Overkill — algo-trader agents read skills from filesystem |
| Provider circuit breakers | OmniRoute-specific — algo-trader has its own resilience patterns |

---

## Implementation Priority

**Phase 1 (This Week):**
1. Create `AGENTS.md` as single source of truth
2. Add git stash block hook
3. Create error sanitization utility
4. Create quality-baseline.json

**Phase 2 (Next Week):**
5. Simplify agent definitions to reference AGENTS.md
6. Add Hard Rule enforcement hook
7. Add coverage ratchet to CI

**Phase 3 (Ongoing):**
8. Add error response regression tests
9. Enforce worktree isolation via Hard Rules
10. Document precedent examples in AGENTS.md

---

## Key Takeaway

OmniRoute's strength is **enforced constraints** — Hard Rules that agents cannot violate, quality ratchets that prevent regression, and a single source of truth. algo-trader has the rules but lacks enforcement. The biggest win is adding **Hard Rules + quality ratchet + single source of truth** — these three patterns alone would prevent the 339 `any` types, 16 console.* calls, and security findings from the bootstrap audit.
