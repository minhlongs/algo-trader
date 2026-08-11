---
name: algo-trader-tooling-landmines
description: Verification commands in algo-trader that fail in ways that mimic catastrophic failure - vitest reporter, zsh word-splitting, dirty-tree deploy guard
metadata:
  type: project
---

Three verification landmines in `algo-trader` produce output that **looks like a disaster but is a
tooling artifact**. Misreading them has derailed ship pipelines.

1. **vitest `basic` reporter is gone.** Repo is on vitest **4.1.2**, which removed it.
   `--reporter=basic` exits 1 with *zero tests run* — reads exactly like total test collapse.
   Always `--reporter=default`. Healthy baseline is **4215/4215 pass**.
2. **zsh does not word-split unquoted parameters.** `npx eslint $CHANGED` locally yields
   `ESLint: No files matching the pattern "<all paths joined>"`, **exit 2** — looks like a broken
   eslint config. CI is bash so the same line works there. Locally use `${=VAR}`, `xargs`, or a file list.
3. **Deploy script hard-refuses a dirty tree.** `scripts/deploy-cf-worker-with-sha-verification.sh:17`
   exits 1 on any `git status --porcelain` output. The tree is *permanently* dirty because
   `.orchestrate/latest/*.md` and `.mekong/company.json` are **tracked** — gitignoring those dirs is a
   no-op for already-tracked files. So `ALLOW_DIRTY_DEPLOY=1` is effectively always required.
   Caveat: the script verifies SHA against the live worker but does **not** check for unpushed
   commits, so a stale-local deploy can pass silently. Push before deploying.

Also dead, do not plan around them: `/mk-bootstrap` does not exist; `ak ship` -> `unknown command
"ship" for "ak"`, exit 1; `/bootstrap` is a *new-project* scaffolder and is wrong for this repo.

**Why:** Each of these mimics a hard failure, and an agent that trusts the surface reading will
either halt a healthy pipeline or, worse, "fix" a non-problem.

**How to apply:** Before accepting any "verification failed" claim in a plan or execution report,
check it against this list first. See [[algo-trader-ci-gate-reality]].
