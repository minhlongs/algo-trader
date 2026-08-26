---
name: acceptance-artifacts-break-env-tests
description: S11 lesson — acceptance runs writing to gitignored data/ files break env-dependent unit tests on rerun; tester must rerun full suite AFTER artifact-producing steps
metadata:
  type: project
---

Acceptance-test steps that write repo-local state (`--record` → `data/research-ledger.jsonl`, run cards under `data/runs/`) silently break env-dependent unit tests that assume those paths are empty (e.g. `verdict-summary.test.ts:126` expects totalRecords===0 from DEFAULT_LEDGER_PATH).

**Why:** Found in S11 review 2026-08-26 — tester reported 7152/7152 but their own sequence wrote ledger records before any post-acceptance suite rerun; local suite was actually 7151/7152. Gitignored data ⇒ CI/fresh clones stay green, so only local verification catches it.

**How to apply:** In any increment whose acceptance flow uses `run-experiment.ts --record` or similar, require the full-suite rerun AFTER artifact-producing commands; treat "tests green" claims made before those commands as unverified. Candidate fix pattern: quarantine/stub default-path tests rather than deleting recorded artifacts.
