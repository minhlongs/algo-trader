# POLY-G8.4 — PR #282 & PR #285 Independent Release Readiness

- **Document ID:** `POLY-G8.4-03`
- **Date:** 2026-11-21
- **PR `#282` HEAD:** `b54e349e014a71082f28c2434dc98d0a0e6d94db`
- **PR `#285` HEAD:** `784d6e986b0e3bad1009af0e1bf1e09400d3b4e7` (appended on `05a1b5262f89b0d07d4c2cdcb2393110b9477605`)

---

## 1. PR #282 (`docs/poly-g8-2-sanitized`) — Independent Audit

**Verdict:** `PR_282 = READY_FOR_OWNER_REVIEW`

- **Scope:** 11 sanitized markdown documents covering G8.2 activation conditions A–F, outbound data-rights inquiry draft, preliminary legal brief, and collector cost model.
- **Checklist Verification:**
  - Documents match current repository source and distinguish pre-G8.3 `TEST_ONLY` findings from G8.3 remediations.
  - Permission-inquiry recipients are official Polymarket channels; sender identity is explicitly unfabricated (`READY_FOR_FOUNDER_SEND`).
  - Legal analysis is labeled preliminary; zero private counsel material, personal identifiers, or secrets disclosed.
  - All six A–F activation conditions remain fail-closed; no document implies data collection has begun or legal clearance was granted.
  - Cost scenarios match documented figures (`$31.06/mo` conservative, `$33.93/mo` base, `$59.32/mo` high load, pre-tax/pre-license) with `INFRA_BUDGET = HOLD`.
  - **CI Status on `b54e349e`:** 11/11 mandatory checks passed (Gate 1, 1b, 1c, 2, 3, 4, 6, 7, 8 Quality Ratchet, Command Injection Scan, Secret Scanning; Gate 5 skipped pre-merge).

---

## 2. PR #285 (`fix/poly-g8-3-evidence-integrity`) — Independent Audit & G8.4 Remediation

### Initial Audit on `05a1b526` (`HOLD` — 3 Verified Defects Found)

1. **Prospective Backfill Forgery Risk (Area C/D):** `recordedAtMs` accepted caller-supplied values and empirical scoring did not exclude forecasts missing authoritative recording attestation or stamped at/after resolution.
2. **Scorecard Default Ledger Path Drift (Area D):** `scripts/poly-g7-scorecard.ts` defaulted to a legacy path rather than the canonical logger default `data/polymarket/market-blind-prospective.jsonl`.
3. **Uploader Transport Timeout & Permission Coverage (Area A/B):** `poly-collector-transport.py` lacked configurable bounded upload timeout support (`POLY_UPLOAD_TIMEOUT_SECONDS`) and explicit regression coverage for timeout process reaping, unreadable source, and read-only destination directory.

### Surgical Remediation Appended (`784d6e98`, 10 files, +121 / -17)

- `src/desk/polymarket/market-blind/market-blind-pipeline-contract.ts` & `market-blind-prospective-pipeline.ts`: Pipeline now stamps authoritative `recordedAtMs` from its injected clock (default `Date.now`), overriding caller-supplied timestamps.
- `src/desk/polymarket/market-blind/market-blind-oos-report.ts`: Empirical OOS scoring excludes unattested or backfilled forecasts (`recordedAtMs >= resolvedAtMs`) with explicit diagnostic `UNATTESTED_OR_BACKFILL_FORECASTS_EXCLUDED`, while preserving legacy record replay without fabricating attestation.
- `scripts/poly-g7-scorecard.ts`: Aligned default ledger path to `data/polymarket/market-blind-prospective.jsonl`.
- `infra/poly-collector/poly-collector-transport.py`: Added bounded `POLY_UPLOAD_TIMEOUT_SECONDS` (default `120s`, clamped to `[0.05, 3600]`).
- Tests (`tests/polymarket/ic-evidence-loader.test.ts`, `market-blind-empirical-eligibility.test.ts`, `market-blind-logger-cli.test.ts`, `poly-collector-upload.test.py`, `uploader-fake-transport.py`): Added backfill, legacy replay, canonical-path, timeout/process-reaping, unreadable-source, and read-only-directory regressions.

### Six G8.3 Areas Verification Matrix (on `784d6e98`)

| Area | Requirement | Local Verification Evidence | Status |
|---|---|---|---|
| **A. Non-destructive uploader** | Dry-run & failed uploads never remove source WAL/Parquet/manifests/checkpoints; covers timeout, corrupt remote, same-length substitution, concurrent retry, interrupted upload, symlink traversal, TOCTOU replacement, permissions | `python3 -I -B tests/polymarket/poly-collector-upload.test.py`: **31/31 passed** (`15.666s`) | `TESTED` |
| **B. Archive SHA-256 integrity** | `local bytes -> SHA-256 -> immutable object -> remote retrieval -> verified SHA-256`; no multipart ETag shortcut; no local deletion without verified archive & policy | Covered in `poly-collector-upload.test.py` (31/31); live R2 round-trip not authorized | `TESTED` (live R2 `NOT_TESTED`) |
| **C. Prospective ledger completeness** | Monotonic sequence, prev/curr hashes, terminal checkpoint, durable write, crash recovery, missing tail/middle detection, stale concurrent writer rejection, authoritative `recordedAtMs` | `tests/polymarket/` (`48` files, **418/418 passed**, `5.88s`); `tsc --noEmit` exit `0`; `eslint --max-warnings 0` on touched `src/` exit `0` | `TESTED` |
| **D. Correct empirical denominator** | No duplicate questions/resolutions, no test fixtures, no empty WAL days, no unattested/backfilled forecasts, canonical scorecard path | Verified in `market-blind-empirical-eligibility.test.ts`, `ic-evidence-loader.test.ts`, and `npx tsx scripts/poly-g7-scorecard.ts` (`0/30d`, `0/500`, `0/150`) | `TESTED` |
| **E. systemd & Rust CLI parity** | Exact supported flags, loopback SIGTERM test, binary build identity parity | `sidecars/poly-book` Rust suite: **58/58 passed** (`52 + 5 + 1`, `0 failed` via `/usr/bin/cc`). macOS cannot execute Linux systemd: **`LINUX_SYSTEMD_RUNTIME = NOT_TESTED`** | `PARTIAL` (`LINUX_SYSTEMD_RUNTIME = NOT_TESTED`) |
| **F. Collector cost model** | Conservative `$31.06/mo`, Base `$33.93/mo`, High `$59.32/mo` (pre-tax, pre-license); no free-tier gaming | Budget remains **`INFRA_BUDGET = HOLD`** | `HOLD` |

**PR #285 Readiness:** Pending final CI green + isolated final diff review on `784d6e98` (updated in `00-EXECUTIVE-IC-VERDICT.md` once CI completes).
