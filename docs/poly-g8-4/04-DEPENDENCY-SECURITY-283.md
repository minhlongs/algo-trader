# POLY-G8.4 — Dependency Security Reconciliation (Issue #283)

- **Document ID:** `POLY-G8.4-04`
- **Date:** 2026-11-21
- **Issue:** `#283`
- **Remediation PR:** Draft PR `#288` (`fix/poly-g8-4-security-283`, HEAD `156642fd`)
- **Verdict:** `ISSUE_283_SECURITY = PASS (remediated in Draft PR #288; USER_001_INVITE remains HOLD pending prod build provenance)`

---

## 1. Root Cause of Scanner Divergence

Before PR `#288`, the repository contained two lockfiles with drifted package resolutions:

| Package | `pnpm-lock.yaml` (canonical PM) | `package-lock.json` (stale npm lockfile) | Patched Range | Advisory |
|---|---|---|---|---|
| `better-auth` | `1.7.7` (patched) | `1.6.29` (vulnerable) | `>= 1.7.0` (exact patched `1.7.7`) | `GHSA-965c-763c-88jm` (Critical) |
| `proxy-addr` | `2.0.8` (patched) | `2.0.7` (vulnerable) | `>= 2.0.8` | `GHSA-jqcg-44mw-7w3h` (Critical) |

- `pnpm audit --audit-level=critical` reported **0 critical** because `pnpm-lock.yaml` already resolved `better-auth@1.7.7` and `proxy-addr@2.0.8`.
- `npm audit --omit=dev --audit-level=critical` reported **2 critical** because `package-lock.json` still pinned `better-auth@1.6.29` (direct production dependency in `package.json`) and `proxy-addr@2.0.7` (transitive dependency via `express`).

---

## 2. Reachability & Production Exposure Assessment

1. **Direct vs. Transitive:** `better-auth` is a direct production dependency (`src/platform/auth/`, `src/seed/auth/`); `proxy-addr` is a transitive production dependency of `express` (used for `trust proxy` forwarded-IP resolution).
2. **Production Runtime Impact:** Both packages sit on production HTTP/auth request paths (session cookies, forwarded client IP trust, tenant isolation). Any CI, Docker, or Cloudflare Worker build executing `npm ci` against `package-lock.json` instead of `pnpm install --frozen-lockfile` would install the vulnerable versions.
3. **Mitigation Verdict:** Passing `pnpm audit` alone does **not** eliminate risk while a stale `package-lock.json` exists in the repo. Reconciling `package-lock.json` removes the drift without altering `pnpm-lock.yaml` or forcing unrelated upgrades.

---

## 3. Targeted Remediation (Draft PR #288)

- **Branch:** `fix/poly-g8-4-security-283`
- **Commit:** `156642fd` (`fix(security): reconcile package-lock.json for better-auth 1.7.7 and proxy-addr 2.0.8 (#283)`)
- **Diff scope:** `package-lock.json` only (`69 insertions(+), 73 deletions(-)`). Zero unrelated lockfile or source changes.
- **Artifact SHA-256 (`package-lock.json`):** `a4bb5c13164be4cbf7115e5a2b81db2ec50b35989c28065a06c68c472ce932ab`

### Verification Commands & Results

| Command | Exit Code | Result |
|---|---|---|
| `npm audit --omit=dev --audit-level=critical` | `0` | `found 0 vulnerabilities` at critical level |
| `pnpm audit --audit-level=critical` | `0` | `No known vulnerabilities found` at critical level |
| CI Gate 1 (Validation), Gate 1b, Gate 1c (PostgreSQL Auth), Gate 2 (Security), Gate 3 (Quality), Gate 4 (Dependency Hygiene), Gate 6, Gate 7, Command Injection Scan, Secret Scanning, Test Suite | `0` | All passed on `156642fd` (Gate 8 Quality Ratchet verified separately) |

---

## 4. Paper Beta (`USER_001_INVITE`) Gate Posture

`USER_001_INVITE` remains **`HOLD`** until the Founder confirms that the currently deployed production Cloudflare Worker (`https://api.cashclaw.cc`) was built from `pnpm-lock.yaml` (`better-auth@1.7.7`, `proxy-addr@2.0.8`) rather than the pre-PR `#288` `package-lock.json`, or after PR `#288` is reviewed and deployed through the authorized release process.
