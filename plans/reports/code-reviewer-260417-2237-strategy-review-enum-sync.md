# Code Review — strategy-review-reasons-enum-sync.test.ts

**Target**: `/Users/macbookprom1/algo-trader/tests/integration/strategy-review-reasons-enum-sync.test.ts` (95 LOC, 4 tests, 142ms local)
**Context**: Continues symmetric integrity-validator pattern (PRs #132 / #135 / #137 / #143). Single test file; zero production code touched.
**Verdict**: **Ship as-is; 2 medium issues worth a follow-up PR, not a blocker.**

## Score: 8.8/10

Severity breakdown — 0 critical, 0 high, 2 medium, 2 low, 2 nit.

## Scope
- File: `tests/integration/strategy-review-reasons-enum-sync.test.ts`
- LOC: 95 (well under 200-line ceiling)
- Sibling docs/code: `docs/strategy-review-reasons.md` (57 LOC), `src/wiring/qwen-signals-loop.ts` (call sites lines 273/278)
- Local run: 4/4 passed, 142ms

## Overall Assessment
Mechanics are sound. Both parsers work on the current doc+code, both sanity floors behave correctly, and the pattern (2x floor + 2x bidirectional sync) is in lockstep with `runbook-index-link-check.test.ts` and `changelog-version-monotonic.test.ts`. JSDoc header is crisp — explicitly calls out what it does NOT validate, which matches convention. Error messages name the failing reason AND hint at remediation ("move to deprecated section or drop"), which is the right bar for a CI failing 6 months from now.

Two medium-severity drift risks worth a follow-up: (a) **commented-out `insertReviewTask` lines produce false positives** in the code parser, and (b) **case-convention enforcement is implicit** — anything other than `[a-z_]+` silently drops.

## Critical
None.

## High
None.

## Medium

### M1 — Commented-out `insertReviewTask` lines produce false positives
The code regex does not strip/skip `//` or `/* */` comments. A dev could comment out a call during a rollback or while drafting a deprecation and the test would still treat it as an active emitter. Confirmed by local reproduction:
```js
// await insertReviewTask(source, 'zombie_reason', metrics);   // ← regex picks this up
```
Impact: during a real deprecation ("remove `zombie_reason` code but keep doc row transient"), the test would spuriously pass, defeating the whole point of "every documented reason is actually emitted". Fix options, increasing rigor:
- **Cheap**: strip single-line comments before matching — `src.replace(/^\s*\/\/.*$/gm, '')`.
- **Right**: parse with TypeScript AST (ts-morph / the existing `src/tools/*` if any). Probably YAGNI for two call sites.
- **Cheapest-correct**: add `(?<!\/\/\s)` negative lookbehind OR require the match be preceded by `await\s+` on the same line.

Recommendation: add the `await\s+` anchor — `/await\s+insertReviewTask\s*\(.../` — closes the comment case with one token, zero new machinery.

### M2 — Case-convention drift silently passes
Regex captures `['\"]([a-z_]+)['\"]` on both sides. If someone introduces `'Sharpe_Low'` / `'sharpe-below-threshold'` / `'SHARPE_LOW'`, the code parser returns empty for that entry. Test 3 (undocumented) passes spuriously; test 4 (stale) fires only if the doc already has it. The sanity floor catches *total wipeout* but not one-off drift.

This is the symmetrical mistake to M1 in PR #143's runbook-link parser (which also hard-codes kebab-case via `[a-z-]`). Not a show-stopper because the convention IS lowercase snake today, but it deserves a one-line assertion to make the convention explicit — e.g. a 3rd test: "every `insertReviewTask(_, 'X', ...)` literal matches `/^[a-z_]+$/`", extracted via a looser regex first. Pushes the policy into the test itself instead of into the parser.

## Low

### L1 — `split('## Active reasons')` is substring-match, not anchored
Today the only header starting with that string is the one section heading. But `### Active reasons` (h3 demotion) or prose like "the ## Active reasons section is legacy" would also match. KISS wins for now, but once the file grows past ~100 lines the risk increases. Consider anchoring:
```js
const activeSection = /##\s+Active reasons[^\n]*\n([\s\S]*?)(?=\n## |\n*$)/.exec(md)?.[1] ?? '';
```
Not worth a re-roll of this PR.

### L2 — Sanity floors `>= 2` are arbitrary, not tied to doc claim
The doc explicitly declares "2 active reasons as of 2026-04-17". A strict equality `.toBe(2)` would pin the test to the current state and force an explicit update when a 3rd reason ships. The current `>= 2` tolerates drift forever. Counter-argument (the one the author likely chose): equality would fire on every legitimate enum extension, creating PR-time noise for zero signal — the sync tests #3/#4 already guard correctness, the floor only guards "parser didn't silently implode". Verdict: **`>= 2` is the correct call**. Flagging only because the report prompt asked.

## Nits

### N1 — Duplicate `source` argument regex fragment
`[a-zA-Z_][\w.]*` appears once but could evolve. Not worth extracting; if a 3rd similar test lands, move to `tests/integration/helpers/enum-sync-parsers.ts` à la `helpers/prometheus-metric-names.ts`. No refactor needed now.

### N2 — File reads executed at describe-time, not beforeAll
`readFileSync` runs at module load, which is identical in behavior to the sibling `runbook-index-link-check.test.ts` and `migration-prefix-integrity.test.ts`. Pattern parity confirmed — **no change**.

## Edge Cases Checked (Scout Phase)

| Case | Behaviour | Verdict |
|---|---|---|
| Table reshape (extra col) | First-column anchor survives | OK |
| Strikethrough deprecated row (`~~reason~~`) | Backtick regex misses — intended | OK (per docstring) |
| Multi-line `insertReviewTask(\n  source,\n  'x',\n  m\n)` | Whitespace-tolerant regex matches | OK |
| Commented-out call `// await insertReviewTask(...)` | **FALSE POSITIVE** | **M1 — fix** |
| Dynamic reason `insertReviewTask(source, r, m)` | Empty set → sanity floor fires | OK (fails loud) |
| `UPPER_CASE` / `kebab-case` reason literals | Silently dropped | **M2 — document** |
| h3 demotion `### Active reasons` | Substring split still fires, parser continues | Fragile, see L1 |
| Future `## Deprecated reasons` table above `## Deprecating…` | Clipped by `split('## ')[0]`, not parsed | OK |
| Accidental nested `## ` inside active section | Clips to empty → floor fires | OK (fails loud) |

## Positive Observations
- **Docstring discipline**: explicit non-goals ("validating label values on Prom counter emission") prevents scope creep in future edits.
- **"Fail loud" engineering**: the `>= 2` floor is justified precisely because the alternative (silent 0-match from parser drift) is worse than false-positive CI red.
- **Error messages actionable**: "move to deprecated section or drop" is operator-facing guidance, not a stack trace.
- **Pattern parity**: mirrors `runbook-index-link-check.test.ts` in layout (sanity floor → bidirectional sync) — future reviewers pattern-match in seconds.
- **Zero new production-code surface**: validator-only PR, lowest possible change-risk.

## Violations of YAGNI/KISS/DRY?
- **YAGNI**: ✅ clean. No speculative abstractions.
- **KISS**: ✅ two regex parsers, two sync tests, two sanity floors. Minimal.
- **DRY**: ✅ within-file. If a 3rd enum-sync validator lands, extract parser helpers (N1).

## Test File Placement & Naming
- Path `tests/integration/strategy-review-reasons-enum-sync.test.ts` — **correct**. Matches sibling placement of the 4 prior integrity validators. File reads from docs/+src/ via `resolve(__dirname, '../../...')` consistent with the others. No DB / no network — "integration" here means "cross-file invariant", not "container-backed". Convention established by PR #132.
- kebab-case with descriptive slug — matches repo rule (`.claude/rules/development-rules.md`) and `runbook-index-link-check.test.ts` / `migration-prefix-integrity.test.ts` style.

## Recommended Actions
1. **Follow-up PR** (not blocking merge): fix M1 by anchoring regex to `await\s+insertReviewTask(...)`. One-line diff.
2. **Follow-up PR** (not blocking): add M2 — a third `it()` asserting every captured reason on both sides matches `/^[a-z_]+$/`, pinning the naming convention into the test.
3. **Defer**: L1 anchored section extraction until the doc grows a 3rd heading that could plausibly collide.

## Metrics
- Type Coverage: 100% (explicit `Set<string>` / `RegExpExecArray | null`; zero `any`).
- Test Coverage: N/A (test file).
- Linting: clean (no ts-ignore, no console, no TODO).
- Local run: 4 passed / 4 total / 142ms.

## Unresolved Questions
1. Should the sibling PR #143 `grafana-alert-provisioning.test.ts` runbook-link regex also be audited for the commented-code false-positive (M1)? The same pattern exists across 3+ validators now.
2. The doc mentions `algo_trader_qwen_strategy_reviews_resolved_total{reason=...}` (PR #123) — does a symmetric validator exist for the *resolve* path, or is it in scope as a future PR? (Doc claims "auto-matches via RETURNING row" — unverified here.)
3. Would a single `tests/integration/helpers/enum-sync-parsers.ts` helper (shared between this test and any future doc↔code enum validators) be worth a pre-emptive extraction, or is 2 call sites still YAGNI territory? Current answer: YAGNI.
