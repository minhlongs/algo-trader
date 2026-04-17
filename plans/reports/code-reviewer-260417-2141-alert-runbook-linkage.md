# Code Review — Alert-Runbook Linkage Integrity Validator

**Date:** 2026-04-17 21:41
**Scope:** 5 files unstaged on `main` (+33 / −3)
**Gate:** auto-approve if ≥ 9.5/10

---

## Score: 9.7 / 10 — APPROVE

Tight, symmetric addition. Two new `it()` blocks close a real integrity gap (1 alert of 8 missing `runbook:`), one new runbook slots into an already-tested index, one README row fixed from a misleading redirect to the canonical playbook. Verified locally: 29/29 integration tests pass, `tsc --noEmit` clean, 8 `runbook:` annotations against 8 alerts, 8 canonical runbooks on disk. No speculative surface area.

---

## Critical issues
None.

## High-priority issues
None.

## Medium / Low + suggestions

1. **Runbook file quality (qwen-kill-switch.md) — LOW, accept as-is.**
   Follows TEMPLATE.md skeleton. 3am operator has: concrete commands (`./scripts/qwen-ops.sh status`, `unkill`), clear env-vs-KV branch, explicit verification checklist with both `source` label values, escalation path (rotate `ADMIN_API_KEY`). No speculation, no "investigate further" hand-waves. Related section correctly disambiguates vs L3 `qwen_drawdown_auto_disabled` gauge — this prevents the exact class of confusion L1/L3 runbooks have historically caused.

2. **Hardcoded URL prefix — LOW, accept.**
   `URL_PREFIX = 'https://github.com/longtho638-jpg/algo-trader/blob/main/docs/runbooks/'` is the right call. A softer matcher (`endsWith('.md')`, regex on path) would silently accept typos in org/repo/branch — the exact failure mode "incident operator 404s at 3am" the test exists to prevent. Repo rename is a deliberate event; the test breaking is correct behavior, not a bug.

3. **YAGNI check — passes.** Not over-engineered. The file-existence probe (`existsSync && statSync().isFile()`) is 2 stdlib calls, no dep added, no helper extraction. A 1-liner regex-only check would not catch the dangling-link case (URL points at `docs/runbooks/qwen-kill-switch.md` but file missing) — which is the second integrity class being asserted. Both `it()` blocks are necessary and minimal.

4. **Colocation vs new file — correct.** Both assertions read the same already-parsed `doc` / `allRules`. Splitting would duplicate the YAML load. DRY-aligned.

5. **Test name nit — IGNORE.** `"symmetric to runbook-index PR #137"` embeds a PR number that becomes stale if the history is ever rewritten. Very minor; matches the style of prior tests (PR #132 reference). Keep for consistency.

6. **Potential follow-up (out of scope) — note only.** The validator asserts URL → file existence but not *file has sections*. A future "runbook structural completeness" test (every runbook has `## Immediate actions`, `## Verification`, etc.) would be the natural next layer. Do not add now — YAGNI until a runbook actually ships broken.

## Positive observations

- Symmetric pattern with PRs #132 (alert-rule metric refs) and #137 (runbook index). Integrity tests now cover three linkage edges: alert↔metric, alert↔runbook-url, index↔file.
- Test error messages name the specific `rule.uid` and the specific failure mode ("incident operator will 404") — fast triage for a future contributor adding a 9th alert.
- README row change replaces a misleading redirect (was pointing L1 kill to drawdown-breach, which has no kill content) — material accuracy fix, not cosmetic.
- Runbook `Related` section proactively prevents L1/L3 gauge confusion — rare kind of defensive doc.

## Metrics

- Integration suite: 29/29 pass (173 expect calls)
- `tsc --noEmit`: clean
- `runbook:` annotations: 8/8 alerts
- Runbook files on disk: 8 canonical + README + TEMPLATE
- Files touched: 5 (3 test/config, 2 docs)
- Diff size: +33 / −3

---

## Unresolved questions

1. **Changelog:** Recent PRs #141, #142, #140, #139, #138, #137 did NOT touch `docs/project-changelog.md`. Last changelog edit was v0.4.x era. Implicit policy appears to be: integrity-test depth additions + minor docs do not bump changelog; feature/fix PRs may. This change is an integrity-test addition — consistent with omitting changelog. **Recommendation: skip changelog bump, consistent with #132/#135/#137/#140/#142 precedent.** If founder wants changelog discipline tightened, decide once and apply to future integrity PRs as a rule.

2. **PR vs direct commit to `main`:** Recent history shows squash-merged PRs (#129–#142) landing on `main` via GitHub, not local direct pushes. User's hand-off message says "direct commit + push per recent PR pattern" — these are distinct. If the intent is local commit + `git push origin main` bypassing the PR, that breaks CI gate symmetry with the #129–#142 history. **Recommendation: open a PR** to keep the audit trail homogeneous and let Gates 1–7 exercise the new test file in CI before it lands. If founder explicitly wants the direct-push path, confirm before executing.
