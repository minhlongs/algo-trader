# Track C — ME Harness Gate Evidence Audit

**Date:** 2026-10-20 · **Track:** C (harness gate evidence) · **Target repo:** `/Users/macbook/Documents/me-deep-wrapper` (READ ONLY — no files modified)
**Goal under audit:** `goal-20260712-202059` ("Alpha Vang Energy 9 Solution"), `current_gate: scale-ready`
**State integrity after audit:** gate-state md5 `aed9950bc54132ea814bc8417891f239` and goal-md md5 `9b5f33327ded93817dd44d041f43f01b` — both identical to pre-audit originals. All mutations caused by running the verifier were reverted.

---

## 0. Method & Sovereignty Note

Running `me solo gates verify` **mutates state** (`record_gate_evidence` writes to the gate-state JSON and rewrites the goal .md). I backed up both files before each run and restored afterward; final md5s match originals (verified in §6). All findings below are from direct source reading plus reversible observation, not from trusting the printed output.

Authoritative sources: `lib/goal-executor-gates.sh` (verifier), `lib/goal-executor-validate.sh` (contracts), `lib/goal-executor-state.sh` (state writer), `agents/registry.json` (`mekongmind_evidence_contracts`), `sops/departments/sales-revenue.md` (gate semantics), on-disk artifacts.

---

## 1. A. What makes `MISS first-revenue CurrentMRR=0` print — exact conditions

Two DIFFERENT checks exist and must not be conflated.

### A.1 The literal string in `verify_gate_artifacts`

`lib/goal-executor-gates.sh:76-88`. The string `MISS first-revenue CurrentMRR=0` prints iff **ALL three hold**:

1. `path=$(_has_any_artifact "$root" "state/evidence/first-revenue.json")` is empty **OR non-empty** — *irrelevant*, `path` is computed but not consulted on this branch;
2. `[ "$current" -gt 0 ]` is **FALSE**;
3. the verifier reached the `else` branch.

`$current` = `revenue_metric_value "$f" "current_mrr"`, falling back to `goal_field "$f" "CurrentMRR"`, defaulting to `0` when empty. Live values measured: `revenue_metric_value current_mrr` → **empty** (key absent from metrics file); `goal_field CurrentMRR` → **0**. So `$current = 0`, `-gt 0` is false, and the message prints with the literal `0`.

**Verdict: the MISS is honest and correct. There is no revenue, and the code says so.**

### A.2 The *other* check — the strict contract (`--strict` only)

`lib/goal-executor-validate.sh:176-197`, inside `validate_gate_artifact_contract "first-revenue"`. Four hard gates, all of which must pass:

| # | Condition | Code's failure message | Actual artifact value | Result |
|---|---|---|---|---|
| 1 | `current_mrr` integer > 0 | `FAIL first-revenue requires provider-backed current_mrr > 0 (current=0)` | `0` | **FAIL** |
| 2 | `provider` contains `polar` | `FAIL first-revenue requires Polar.sh provider` | `NOWPayments` | **FAIL** (would fail if #1 passed) |
| 3 | `payment_status` not pending/none/draft | `FAIL ... payment_status is not paid/signed/provider-backed` | `"ready"` | passes the token filter, but semantically only means "wired up" |
| 4 | `provider_sync_status` not pending/stale/manual/local | `FAIL ... provider_sync_status is not verified` | `"webhook_ready"` | passes the filter, but not `verified` |

Direct run: `FAIL first-revenue requires provider-backed current_mrr > 0 (current=0)`.

### A.3 SOP is even stricter than the code — and names a *different* provider

`sops/departments/sales-revenue.md` says the canonical proof is `POLAR_MRR_FILE=<verified-export.json> me solo revenue sync polar` (line 47, also line 42 step 4), "no MRR without provider-backed evidence", and "Write first revenue evidence only when paid customer, signed commitment, or verified Polar-backed MRR exists" (SOP step 5).

The project deliberately uses **NOWPayments**, not Polar — consistent with the user's global rule "Polar REJECTED this product — do NOT use Polar for Sophia". So the code's `provider must contain "polar"` test is **wrong for this project** and cannot be satisfied without fabricating a Polar claim. This is a code bug to fix, not an artifact gap.

**Combined verdict on `first-revenue`:** the `passed` status is **not defensible** under the project's own validator, the verifier's own artifact check, or the SOP. Zero of four contract conditions and zero SOP conditions are met. `current_mrr: 0` in the artifact is the truth-telling field; the `status: "passed"` beside it is what is wrong.

---

## 2. B. Audit of the other gates

### 2.1 Evidence-count provenance — the count is not what it appears

Every non-empty `evidence[]` array in the gate state is **not** a ledger of distinct work. Source-string analysis:

| Gate | Total ev | `artifact` | `artifact:strict` |
|---|---|---|---|
| company-blueprint | 45 | 45 | 0 |
| offer-validated | 45 | 45 | 0 |
| mvp-live | 55 | 45 | 10 |
| fulfillment-stable | 23 | 11 | 12 |
| scale-ready | 11 | 11 | 0 |
| repeatable-channel | 23 | 11 | 12 |
| first-revenue | **0** | — | — |
| first-1m-mrr | 0 | — | — |
| idea-intake | 0 | — | — |

These are **append-only counter artifacts** produced by re-running the verifier. Each entry's `note` is the same artifact path, and `source` only distinguishes `artifact` vs `artifact:strict`. A gate with 45 entries has not done 45 things; it has been *verified 45 times*. Evidence count measures **verifier invocation frequency**, not quality. Date spans are identical in shape across gates (first `2026-08-10T02:01:21`, last `2026-10-20T11:24:03-04`), i.e. two bulk backfill runs on 2026-08-10 and today 2026-10-20.

**A high count with a same-path note is worthless as proof. Only the artifact file's *content* matters.**

### 2.2 Per-gate substantive audit

Verified by running the shipped validators against real artifact paths (not by reading summaries):

| Gate | Stated status | Ev count | Most recent ev | Contract check (strict) | Artifact content verdict |
|---|---|---|---|---|---|
| `idea-intake` | passed | 0 | — | **no contract exists** in registry; no artifact `state/evidence/idea-intake.json` | **Unfalsifiable / not evidenced.** Hardcoded `status:"passed"` in `init_gate_state` (goal-executor-state.sh:145). Nothing to verify against. |
| `company-blueprint` | passed | 45 | 2026-10-20 | **PASS** (ceo-command contract satisfied) | **Weak but real.** Artifact has all 8 fields but its `idea` text is about *"Deploy tiktok-shop-api to production on Cloudflare Workers"* — a **different project** from algo-trader. `target_customer` says *"buyer hypothesis … Market Intelligence must validate"* — explicitly a hypothesis, not validated. |
| `offer-validated` | passed | 45 | 2026-10-20 | **FAIL** — missing 18 required fields across two contracts | **Unsubstantiated stub.** File has only 6 keys: `department, gate, note:"", owner, status:"ready", updated_at`. `note` is empty. Backing a `passed` gate with 45 evidence entries. |
| `mvp-live` | passed | 55 | 2026-10-20 | **PASS** (engineering-factory + quality-compliance + platform-operations) | **Best-evidenced gate.** `build_command: "bun run build && bun test"`, `tests_run: "15,619 passing tests, 0 failing"`, `build_status: passed (0 TS errors)`, `release_decision: approved`. Caveat: `health_url: http://localhost:8787/api/health` is a **local host**, and `known_risks: []` is empty — a suspiciously risk-free claim. |
| `first-revenue` | **passed** | **0** | — | **FAIL** (see §1) | **Mislabelled. Highest-severity finding.** See §3. |
| `first-1m-mrr` | active | 0 | — | **FAIL** — artifact is **corrupt JSON** | `state/evidence/first-1m-mrr.json` is truncated mid-string at line 89 (3207 chars, unbalanced braces 16/13, brackets 5/4). Its visible fields honestly say `mrr_current.amount_usd: 0`, `customers: 0`, `nowpayments_sync: false`, `api_key_configured: false`, `status: "active"`. Status `active` is honest; the **corrupt file is a separate defect** that must be fixed or removed. |
| `fulfillment-stable` | passed | 23 | 2026-10-20 | **PASS** (customer-success contract) | **Assertions, not proof.** `success_metric` is a target (*"within 48h"*), `support_open_items` lists two unresolved blockers, `renewal_risk` says *"Low for PRO+ tiers (recurring … IPN)"* while `provider_sync: false`. There is **no customer**, so "fulfillment stable" describes *design*, not delivered fulfillment. |
| `scale-ready` | passed | 11 | 2026-10-20 | **FAIL** — missing 7 required fields | **Unsubstantiated stub.** 6 keys; `note: "gate='scale-ready' -> next=knowledge-memory"` is an orchestrator breadcrumb, not evidence. |
| `repeatable-channel` | passed | 23 | 2026-10-20 | **PASS** (growth-marketing contract) | **Capability, not repeatability.** `outreach_log: "Infrastructure ready — API endpoints: …"`. A repeatable channel requires a measured loop; this is *"infrastructure ready"* prose. |
| `company-blueprint` *(listed in tasks)* | passed | 45 | 2026-10-20 | see above | same as above |

**Zero of 9 gates have evidence that proves the gate's own claim.** 4 of 9 (offer-validated, first-revenue, scale-ready, first-1m-mrr) actively **fail** their shipped contract. The remaining 5 pass field-presence checks but their content describes *readiness/capability*, which is a materially different claim than *delivery*.

---

## 3. C. Correct status of `first-revenue` and the minimum truthful artifact

### 3.1 What the correct status IS

`first-revenue` should be **`pending`** (not `passed`, not `active`, not `failed`).

Reasoning:
- It is not a *failure of execution* — revenue work is legitimately early-stage and the provider is code-complete but unconfigured. Marking it `failed` would falsely imply the team tried and lost.
- It is certainly not `passed` — §1 proves it.
- `pending` is the harness's own vocabulary for "not yet satisfied" (`init_gate_state` seeds all non-idea gates as `pending`), so this uses existing state semantics rather than inventing a term.
- Note the current ladder already violates the canonical order: `first-revenue` says `passed` while `first-1m-mrr` (downstream, [$1M]) says `active`. A downstream gate cannot be *further along* than its prerequisite. `pending` fixes that inversion.

**The artifact `state/evidence/first-revenue.json` needs no content change to become truthful** — its `current_mrr: 0` and `provider: NOWPayments` are already honest and self-consistent. Only its `status` field (`"passed"`) and the goal's downstream implications are wrong. Minimal fix: flip artifact `status` to `"pending"` **and** the gate-state entry to `"pending"`.

### 3.2 What would make `passed` truthful (minimum artifact)

All four of these must be true simultaneously — no exceptions:

1. `current_mrr` an integer **> 0** in `state/evidence/first-revenue.json` **and** in `state/revenue/<goal-id>.json`.
2. `provider_sync_status: "verified"` with an actual provider sync having occurred — requires `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` configured in production (currently `provider_evidence.api_key_configured: false`).
3. `payment_status` describing a real payment, e.g. `"paid"`, with a customer/invoice identifier.
4. Source of truth reconciled via `me solo revenue sync` from a real provider export (per SOP step 4).

Plus the schema fix in §4.3 (otherwise the metric is never read).

Plus a **bug fix to the validator**: remove the hardcoded `provider must contain "polar"` requirement, replacing it with "provider is a configured, synced payment provider" (NOWPayments is the sanctioned provider for this product — Polar was explicitly rejected for it). Without this fix, `--strict` can never pass for this project even with genuine revenue, and the incentive is to fabricate a Polar claim.

### 3.3 Proposed exact JSON diff — NOT WRITTEN, for approval

**Change 1 — `state/gates/goal-20260712-202059.json`**, gate entry `first-revenue`:

```diff
     {
       "id": "first-revenue",
       "label": "First Revenue",
-      "status": "passed"
+      "status": "pending"
     },
```

**Change 2 — `state/evidence/first-revenue.json`**, top level:

```diff
   "payment_status": "ready",
   "provider": "NOWPayments",
+  "revenue_realized": false,
+  "blocker": "NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET not configured in production; zero paid customers to date.",
-  "status": "passed"
+  "status": "pending"
   "updated_at": "2026-08-10T03:35:00.000000Z",
```

(Adding `revenue_realized: false` and a `blocker` note makes the artifact self-explanatory. `current_mrr: 0` stays exactly as-is — **it is the true value** and must not be edited.)

**Explicitly NOT proposed**, per hard rules:
- Do **not** write any non-zero `current_mrr`. No revenue has occurred.
- Do **not** add evidence entries to inflate the 0 count.
- Do **not** touch `first-1m-mrr.json`'s `mrr_current: 0` (true).
- Do **not** mark `scale-ready`'s or `offer-validated`'s stubs as substantive — they need real content written by their departments, which is a different track's work (see §7).

**Separately recommended (does not change the gate verdict, but is a real defect):** `state/evidence/first-1m-mrr.json` is corrupt JSON (truncated at line 89). It must be either repaired to valid JSON or removed. It is currently **unreadable by any validator**, which silently degrades to `MISS` — a failure mode that hides itself. Repairing its JSON is orthogonal to its `status:"active"`, which is already honest.

---

## 4. D. Is `--strict` verification possible? No — and the non-strict path is not trustworthy either

### 4.1 The `--strict` crash — confirmed, and the fix is recoverable

`reconcile_goal_gate_state` is called at `bin/me:1466` and `bin/me:1484` and is **defined in zero live files**. Verified by grep across `bin/me`, `lib/goal-executor.sh`, `lib/goal-executor-state.sh`, `-core.sh`, `-gates.sh`, `-dispatch.sh`, `lib/goal-executor-validate.sh` — all return 0 matches.

It exists only in `lib/goal-executor.sh.corrupted-backup` (line 881), a file the name of which declares it dead. Live run: `./bin/me solo gates verify --strict` → **exit 127**, `./bin/me: line 1466: reconcile_goal_gate_state: command not found`.

The backup's implementation is *usable as a reference*, but note two problems:
- Its canonical gate list is `[idea-intake, company-blueprint, offer-validated, mvp-live, first-revenue, repeatable-channel, fulfillment-stable, scale-ready, first-1m-mrr]` — **9 gates**, whereas `init_gate_state` seeds **6** and the live state file has **8** (no `first-revenue` gap; live order differs). A reconcile that hardcodes a different canonical list would emit spurious `non-canonical gate id` DRIFT.
- It would exit 1 on any "later gate active/passed while previous gate pending" — which under today's data triggers, because `first-1m-mrr` is `active` while `first-revenue` is `passed`.

**So: `--strict` is not merely broken, it is broken in a way that would report DRIFT until the `first-revenue` status is corrected.** The §3.1 fix is a prerequisite for any honest reconcile implementation.

### 4.2 FAR WORSE: the non-strict "success" is a lie — it mutates the goal

This is the finding that most changes the picture. `me solo gates verify` exits 0 and is the path phase-07 treats as "works". It does not merely read state — `record_gate_evidence` (goal-executor-state.sh:198) **unconditionally** does:

```python
data["current_gate"] = gate          # <-- clobbers current_gate on every evidence record
data["updated_at"] = now
...
g["status"] = "passed"              # <-- the ONLY writer of "passed" in the whole codebase
```

and then `set_goal_field "$f" "CurrentGate" "$gate"`.

**Empirically confirmed:** running `--strict` (which records evidence for mvp-live, repeatable-channel, fulfillment-stable and fails the rest) **changed `current_gate` from `scale-ready` to `fulfillment-stable`** — because `fulfillment-stable` happened to be the last gate whose evidence got recorded, in `verify_gate_artifacts`' evaluate order. The goal's own `CurrentGate: scale-ready` line in `state/goal-20260712-202059.md` was overwritten too. I restored both files.

Consequences:
1. **A read-only-sounding "verify" rewrites the goal.** Any CI/CD or agent that calls it as a check silently mutates the very state it checks. The gate state drifts based on verifier *invocation order*, not on reality.
2. **`current_gate` is meaningless.** It encodes "which gate was last evaluated during whichever verify run happened last", not progress.
3. **`--strict` and non-strict disagree on `current_gate`** (strict → fulfillment-stable, non-strict → scale-ready) purely as a function of which gates failed, proving the value is an artifact of evaluation order.
4. The exit code 0 from non-strict mode is therefore **not evidence of anything**. It means "no shell error", not "gates satisfied".

Because the two runs already diverged in `current_gate`, **the current on-disk state cannot be assumed to be the pre-investigation state**, and I restored from a byte-identical backup to guarantee this.

### 4.3 A second latent bug found: metric key mismatch (silent false-zero)

`state/revenue/goal-20260712-202059.json` stores **`mrr_usd`**, but the gate verifier reads **`current_mrr`** via `revenue_metric_value`. Measured live:

```
revenue_metric_value current_mrr -> []        (empty → defaults to 0)
revenue_metric_value mrr_usd      -> 0
```

Today both paths give 0, so no false PASS occurs. But if anyone ever populates `mrr_usd`, the gate would still read empty→0 and print `MISS`, or conversely `record_revenue_mrr` writes `current_mrr` while other writers write `mrr_usd` — a guaranteed future divergence that **silently produces the wrong gate verdict**. Fix: standardise on `current_mrr` (the key `record_revenue_mrr` and `revenue_metric_value` both use) and add a read-side assertion.

### 4.4 What verification path IS trustworthy

Given the above, **the shipped verifier cannot be trusted in either mode.** The only trustworthy path today is **direct, manual artifact inspection against the registry contracts** — exactly what §2 did. Concretely:

| Need | Trustworthy action | Why |
|---|---|---|
| Is a gate satisfied? | Run `validate_department_artifact <dept> <path>` / `validate_gate_artifact_contract <gate> <path> <dept>` **directly** (I did this; outputs quoted in §2.2) | These are pure read-only functions — no `record_gate_evidence`, no state write. Safe and authoritative. |
| Gate state at a point in time | `jq '.gates[] \| {id,status,ev:(.evidence\|length)}' state/gates/goal-<id>.json` | Read-only; cannot drift. |
| Truth of revenue | `state/revenue/<goal-id>.json` + `state/evidence/first-revenue.json` read directly | Both show 0 / `mrr_usd: 0`, `provider_sync: false`, `api_key_configured: false`. |
| **Do NOT** | `me solo gates verify` (either mode) | Mutates `current_gate` + goal .md; `--strict` exits 127. Treats existence as proof. |

Do not "fix" this by reimplementing `record_gate_evidence` to stop mutating — that is a real upstream change, but it is **out of this track's scope** (target repo is read-only for Track C) and must be sequenced with the §3.1 status correction, or the reconcile will report DRIFT.

---

## 5. E. Gate trustworthiness table (9 gates)

`Evidence-backed?` = does a contract-validating artifact exist. `Truly satisfied?` = does the artifact's *content* prove the claim.

| # | Gate | Stated status | Evidence-backed? | Truly satisfied? | Basis |
|---|---|---|---|---|---|
| 1 | idea-intake | passed | **No** (0 entries, no contract, no artifact) | **No — unfalsifiable** | Hardcoded `passed` in `init_gate_state`; nothing to verify. |
| 2 | company-blueprint | passed | **Yes** (45 ev, contract PASS) | **Partly** | All 8 fields present, but `idea` describes a *different project* (tiktok-shop-api) and `target_customer` is an explicit hypothesis. |
| 3 | offer-validated | passed | **No** (45 ev, contract **FAIL**) | **No** | Near-empty stub, 6 keys, `note: ""`; 18 required fields absent. |
| 4 | mvp-live | passed | **Yes** (55 ev, contract PASS) | **Yes, with caveat** | Strongest evidence (15,619 tests, build passed) but `health_url` is localhost and `known_risks: []`. |
| 5 | first-revenue | **passed** | **No** (0 ev, contract **FAIL**) | **No** | §1. `current_mrr: 0`; 0 of 4 conditions met. **Mislabelled — must be `pending`.** |
| 6 | first-1m-mrr | active | **No** (0 ev, artifact corrupt JSON) | **No** | Artifact unreadable; honest values 0 customers / `api_key_configured: false`. Status `active` is honest; file is corrupt. |
| 7 | fulfillment-stable | passed | **Yes** (23 ev, contract PASS) | **Partly — readiness only** | Field-presence passes, but `success_metric` is a target and `support_open_items` non-empty; no customer exists. |
| 8 | scale-ready | passed | **No** (11 ev, contract **FAIL**) | **No** | 6-key stub; `note` is an orchestrator breadcrumb; 7 required fields absent. |
| 9 | repeatable-channel | passed | **Yes** (23 ev, contract PASS) | **Partly — capability only** | `outreach_log` = "Infrastructure ready"; no measured repeatability. |

**Score: 0 of 9 fully truthful · 1 of 9 defensible with caveats (mvp-live) · 2 readiness-only · 3 outright mislabelled (first-revenue) or contract-failing stubs (offer-validated, scale-ready) · 2 explicitly unproven (idea-intake, first-1m-mrr).**

**Bottom line: the ME harness gate evidence does not support deploy approval.** Non-strict exit 0 is an artifact of a buggy verifier, not a pass.

---

## 6. Target-repo integrity (read-only compliance)

| Item | Value |
|---|---|
| `state/gates/goal-20260712-202059.json` md5 | `aed9950bc54132ea814bc8417891f239` |
| `state/goal-20260712-202059.md` md5 | `9b5f33327ded93817dd44d041f43f01b` |
| `current_gate` | `scale-ready` (restored; strict run had moved it to `fulfillment-stable`) |
| `git status --porcelain` (tracked files) | empty |
| Untracked residue | `.mekong/audit.db` only — mtime 2026-10-06, **predates this audit** (created by earlier `me` runs), not produced by Track C |

Backups used: `/tmp/gate-state-backup-trackc.json`, `/tmp/goal-md-backup-trackc.md`. No file in `/Users/macbook/Documents/me-deep-wrapper` was edited, created, or deleted. All diffs above are proposals only.

---

## 7. Limitations & scope

- **Did not** fix the `reconcile_goal_gate_state` gap, the `record_gate_evidence` mutation bug, the `polar`-only provider check, or the `mrr_usd`/`current_mrr` key mismatch — all four are upstream in the read-only repo and need a change-authorising decision (tracked in phase-07's unresolved question).
- **Did not** write substantive content for the stub artifacts (offer-validated, scale-ready) or the corrupt first-1m-mrr file. Those require real departmental work, not edits; fabricating content is exactly what this audit forbids.
- **Did not** independently verify the *truth* of passing artifacts' claims (e.g. whether 15,619 tests actually pass in algo-trader now, or whether the mvp-live artifact's localhost health URL has since moved to production). Field-presence validation was run; external re-execution was out of scope. Claims are only as good as their write-time honesty.
- **Did not** audit the 4 other goal files in `state/gates/` (`goal-20260608-153645.json`, `goal-20260706-220716.json`, `goal-20260712-163831`, `goal-20261007-110504.json`) — only the active `goal-20260712-202059` was in scope.

## 8. Unresolved questions

1. **Is `me-deep-wrapper` in scope for editing at all?** phase-07 lists this as blocking. §4.2/§4.3 bugs mean the harness *cannot* be trusted for gate verification until it is answered. Without an edit, the trustworthy path is direct validator calls (§4.4) and `jq` — which is workable but manual.
2. **Who owns the `idea-intake` `passed` default?** It has no contract and no artifact, so it can never be falsified. Should it be deleted from the ladder or given a real contract?
3. **Should `company-blueprint`'s cross-project `idea` text (tiktok-shop-api) be corrected**, given it is the one contract-passing artifact and currently describes a different product?
4. **Repair or delete `state/evidence/first-1m-mrr.json`?** It is corrupt JSON. If repaired, its honest content is `mrr_current: 0 / active` — no decision needed on content, only on whether a truncated file should be restored or dropped.
5. **After the §3.1 status fix, does the harness's own `reconcile` then pass?** Unverifiable until `reconcile_goal_gate_state` exists. The state-file gate order (8 gates, `first-revenue` before `first-1m-mrr`) and the backup's canonical list (9 gates, different order) must be reconciled first.
6. **Does the go-live decision use "ME gate approved" as a hard blocker?** `CLAUDE.md:96` says "DO NOT deploy without … ME IDEA PSF gate approved". Since no gate is truthfully satisfied, either deploy is blocked, or the requirement is explicitly waived and re-worded by the user. **This is a user decision, not an analyst one.**
