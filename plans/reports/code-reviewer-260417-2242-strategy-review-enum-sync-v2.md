# Code Review v2 — strategy-review-reasons-enum-sync.test.ts

**Target**: `/Users/macbookprom1/algo-trader/tests/integration/strategy-review-reasons-enum-sync.test.ts` (119 LOC, 5 tests, 186ms local)
**Prior report**: `code-reviewer-260417-2237-strategy-review-enum-sync.md` (score 8.8/10, 2M/2L/2N)
**Verdict**: **APPROVE FOR AUTO-MERGE**. M1 + M2 closed cleanly. Score **9.6/10** ≥ 9.5 threshold, 0 critical / 0 high.

## Score: 9.6/10 (was 8.8/10)

Severity: 0 critical, 0 high, 0 medium, 2 low (unchanged, both deferred-by-design), 1 nit.

## Fix Verification

### M1 — `stripComments()` preprocessor ✅ CLOSED

Implementation at lines 30-34:
```typescript
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}
```
Applied at line 66 before the `callRegex` sweep. Block-before-line order is correct (block regex's lazy `[\s\S]*?` avoids greedy cross-comment match).

**Adversarial test (8 cases, locally reproduced)**:

| Case | Behaviour |
|---|---|
| `await insertReviewTask(source, 'live_reason', m)` | matches `live_reason` ✅ |
| `// await insertReviewTask(source, 'zombie', m)` | stripped → no match ✅ |
| `/* await insertReviewTask(source, 'zombie', m) */` | stripped → no match ✅ |
| Multi-line `/* … \n … */` block around call | stripped → no match ✅ |
| `await insertReviewTask(source, 'live', m) // note` | live matches, trailing comment stripped ✅ |
| String containing `https://example.com` | false-strip of content after `//` — docstring already acknowledges |
| Regex literal `/\/\/abc/` followed by live call | live matches anyway ✅ |

Verified via `grep` on `src/wiring/qwen-signals-loop.ts` — **zero** string literals contain `//` or `/*` sequences, so the acknowledged limitation is inert in the current codebase. Docstring at L27-29 calls this out honestly ("Naive but sufficient for this repo"). KISS over AST — **correct call**.

### M2 — snake_case style assertion ✅ CLOSED

Three-part implementation:
1. Broadened doc regex capture `([\w-]+)` at L48
2. Broadened code regex capture `([\w-]+)` at L65
3. New test at L96-102 with `STYLE_RE = /^[a-z][a-z0-9_]*$/` (L74)

**Regex coverage verified (10 cases)**:

| Input | Test result | Expected |
|---|---|---|
| `win_rate_below_threshold` | pass | pass ✅ |
| `sharpe_below_threshold` | pass | pass ✅ |
| `Sharpe_Low` | fail | fail ✅ |
| `sharpe-below` | fail | fail ✅ |
| `SHARPE_LOW` | fail | fail ✅ |
| `3leading_digit` | fail | fail ✅ |
| `_leading_under` | fail | fail ✅ |
| `reason_1` | pass | pass ✅ |
| `trailing_under_` | pass | pass (acceptable — doc convention is lenient here) |
| `has space` | fail | fail ✅ |

Key improvement: assertion runs on the **union** of doc + code reasons (L97), so drift on either side fires the test. Error message names offenders + explains *why* (Prom label + DB column). Operator-grade failure guidance.

Capture broadening is necessary + sufficient: without it, a `Sharpe_Low` literal would be dropped pre-assertion and M2 would still silently pass. With it, the regex admits kebab/camel/UPPER into the set, and the style test catches them. **Chain is tight**.

## Re-scan for Regressions

| Prior edge case | v2 behaviour |
|---|---|
| Table reshape (extra col) | first-column anchor unchanged | OK |
| Strikethrough `~~reason~~` | backtick regex still misses | OK |
| Multi-line call | whitespace-tolerant regex unchanged | OK |
| Commented call (was M1) | `stripComments` → stripped | **FIXED** |
| Dynamic reason variable | empty set → sanity floor fires | OK |
| UPPER/kebab literal (was M2) | now captured and failed by STYLE_RE | **FIXED** |
| h3 demotion (L1) | still substring-match | deferred by design |
| `>= 2` floor (L2) | unchanged | deferred by design |

## Low (unchanged from v1 — not blocking)

### L1 — `split('## Active reasons')` substring match
Unchanged from prior. Still fragile to `### Active reasons` demotion or prose containing the literal. Neither risk materialises in current doc. **Deferred**.

### L2 — `>= 2` sanity floor vs strict equality
Unchanged. Prior report already concluded `>= 2` is the correct call (avoids PR-time noise on legitimate enum extension). **Deferred by design**.

## Nit

### N1 — `STYLE_RE` allows trailing underscore
`/^[a-z][a-z0-9_]*$/` admits `foo_` (trailing underscore). Cosmetic only — no real reason name would ever be written that way, and tightening to `[a-z][a-z0-9_]*[a-z0-9]` adds complexity for a non-risk. **No change**.

## Positive Observations (v2 additions)

- Comment order in `stripComments` (block before line) is the non-obvious correct order — prevents `//` inside `/* … // … */` from being stripped first and leaving dangling `*/`. Author got this right.
- Preserving original `callRegex` and adding a preprocessor (rather than complicating the regex with negative lookbehinds) keeps each function's responsibility narrow. Good factoring.
- STYLE_RE extracted as module-level const (L74) — reusable, testable, self-documenting.
- Error message for style violation names both the count AND the offenders AND the reason — operator doesn't need to re-derive the convention.
- JSDoc updates on extract functions reflect the broadened capture + defer-to-style-check pattern explicitly ("surfaces in the style assertion"). Future readers won't misread `[\w-]+` as lax.
- Test count 4→5 symmetric with the 2-floor + 3-check structure; no orphan assertions.

## YAGNI / KISS / DRY

- **YAGNI**: ✅ no AST dep added, no helper extraction, no speculative abstraction.
- **KISS**: ✅ 5-line preprocessor + 1 extra test. No state machine, no parser combinator.
- **DRY**: ✅ `STYLE_RE` is the single source of truth. Prior worry about N1 helper extraction only fires if 3rd validator lands.

## Metrics

- Type Coverage: 100% (explicit `Set<string>`, `RegExpExecArray | null`; zero `any`).
- LOC: 119 / 200 ceiling (well under).
- Local run: **5 passed / 5 total / 186ms**.
- Integration suite (claimed): 56/56 pass (55 + 1 new snake_case). Not independently verified in this review (scope = single file).
- Linting: clean — no `@ts-ignore`, no `console`, no `TODO/FIXME`.

## Approval Criteria

| Gate | Threshold | Actual | Pass |
|---|---|---|---|
| Critical issues | 0 | 0 | ✅ |
| High issues | 0 | 0 | ✅ |
| Score | ≥ 9.5 | 9.6 | ✅ |
| Tests pass | 100% | 5/5 | ✅ |

**APPROVE FOR AUTO-MERGE.**

## Unresolved Questions

1. Docstring for `stripComments` says "no string literals contain `//` or `/*` sequences" — this is verified for the **current** `qwen-signals-loop.ts` (grep-confirmed). Is there a lint rule or CI check that would fail if a future edit introduces such a string literal (e.g. logging a URL in an error message)? If not, this is a latent maintenance trap — worth a one-line comment linking to the test.
2. The broadened capture `([\w-]+)` now admits hyphens on the DOC side. Doc table rows like `| \`retired-reason\` |` would be captured, fail STYLE_RE, and fire the style test — **correct**. But a doc-only strikethrough `~~retired-reason~~` is still skipped (no backticks). Confirm that's the intended behaviour for migration rows (probably yes — prior report accepted this).
3. No test asserts that `stripComments` itself is idempotent or that block-before-line order is the right one. Not worth a dedicated test (internal helper, <5 LOC), but worth a one-line comment noting the order is load-bearing. Nit.
