# Verification Report — S10 Alpha Gap-Closure (Binh-phap-cicd 11 lines)

- Git Push:   ✅ fc2eab17 → main (PR #38 squash-merged, branch feat/alpha-gap-closure)
- CI Gate 1:  ✅ Validation (tsc + lint + strategies + tests) — run 32890272832
- CI Gate 2:  ✅ Security scan (secrets + audit critical)
- CI Gate 3:  ✅ Quality (payload eslint strict --max-warnings 0 + file size policy)
- CI Gate 4:  ✅ Dependency hygiene (lockfile + outdated)
- CI Gate 5:  ✅ Deployment smoke (prod URLs after merge, post-merge run on main)
- CI Gate 6:  ✅ Paper gate lock (Pillar 1 doctrine date lock)
- CI Gate 7:  ✅ Shell lint (shellcheck scripts/*.sh warning severity)
- CF Pages:   ✅ Deployment 20b2a98f (manual wrangler pages deploy dist/dashboard/, project algo-trader)
- Prod HTTP:  ✅ 200 on https://algo-trader.pages.dev + https://cashclaw.cc
- Timestamp:  2026-08-26T02:43+07:00 (Asia/Saigon)

## Feature smoke

- `node dist/desk/cli/cashclaw-cli.js alpha candidates` — exit 0, lists 3 experiments
  (multi-factor-momentum-sol-1h, rsi-mean-reversion-btc-1h, volume-breakout-eth-4h) + 4 baselines.
- `alpha report rsi-mean-reversion-btc-1h --json` — exit 0, byRegime = 4 regimes present.
- `run-experiment.ts --config src/alpha-lab/configs/rsi-mean-reversion.json` — exit 0,
  artifacts carry real `regimesPresent` (4 occurrences in output).

## Pre-deploy checklist (local, all green)

- typecheck 0 errors · eslint src/ 492/501 warnings (no regression) · payload lint strict pass
- 7132/7132 tests pass (+2 new vs baseline 7130) · secret scan 0 matches
- quality ratchet 8/8 · paper-gate-lock PASSED · shellcheck clean · dry-run exit 0

## Escrow status

- **E7 CLOSED** — S1 merged; manual deploy script now deploys correct artifact to canonical
  URLs and was used verbatim for this deployment (deployment 20b2a98f).
- **F2 CLOSED** — winRate label-parity shipped with before/after snapshots
  (`plans/reports/f2-{baseline,after}-*.json`, all valid JSON).
- **DERIV DEFERRED** — derivatives feature group needs a new data source (funding/OI);
  documented in DoD audit doc.
- **G1 (LOW, follow-up)** — EXTREME cost scenario exists only in CashClaw workstream;
  alpha-lab `listStressModes()` still NORMAL/CONSERVATIVE/ADVERSE. Product decision needed.
