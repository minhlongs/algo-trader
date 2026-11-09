# 09 — Open-Core & Packaging Truth (`audit-261101-golive-poly`)

## 1. Readiness & Boundary Verification
- **Important Caveat (Memory & Audit Rule):** Historical readiness scorers that only check `fs.existsSync` or markdown checkboxes (`25/25 READY`) prove file existence, **not** runtime behavior.
- In this audit (`S0–S9`), every claim in `02-verification-matrix.md` is backed by behavioral unit/integration tests and live Cloudflare Edge Staging probes (`https://algo-trader-staging.agencyos-openclaw.workers.dev/api/health`), never by `existsSync` alone.

## 2. Packaging & Hygiene Checks
- `.claude/` rules, hooks, skills, and internal session artifacts are excluded from customer-facing builds and npm packaging.
- `pnpm audit --prod` reports `0` known vulnerabilities (`better-auth` upgraded to `1.7.7` in `PR #214`).
- Quality Ratchet (`bash scripts/quality-ratchet.sh`) enforces:
  - `anyTypes <= 0` (`0` actual)
  - `consoleCalls <= 2` (`2` actual)
  - `filesOverMaxLines <= 0` (`0` actual)
  - `bannedImports == 0` (`0` actual)
  - `eslintDisables <= 0` (`0` actual)
- Backtest Leaderboard Integrity (`npm run check:leaderboard`) verifies that `docs/backtest-leaderboard.md` is 100% synchronized with `reports/backtest-results.csv` (`30/30` strategies `OK`, `total_trades > 0` under the net-of-fee ledger, `0` `Infinity`/`NaN`).
