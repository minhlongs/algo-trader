# S11 B4 — Final Acceptance Test Report (tester)

- Date: 2026-08-26 (run 2026-08-25 21:52–22:05 UTC)
- Branch: `feat/vibe-audit-gap-closure` @ commit 80192461
- Plan: `.orchestrate/latest/plan.md` §B4 + §3 risks/gates
- Verdict: **B4 PASS** (all commands exit 0; artifact dataSource='real'; EXTREME row present)

## 1. Full test suite

`npx vitest run` → **505 files / 7152 tests passed, 0 failed, 0 skipped** (exit 0).
Baseline main@55714c28 = 7132; +20 from B3 additions. Duration 16.13s wall (60.7s CPU).
No flaky failures observed; no known-fail list applicable (memory baseline from 2026-08-13 is stale — suite is now zero-fail).

## 2. B4 acceptance sequence

### a. Doctor — PASS (exit 0)
`npx tsx src/desk/cli/cashclaw-cli.ts doctor` → exit 0, 5/5 checks PASS:
1. Execution mode: READ_ONLY
2. Postgres ohlcv_candles: reachable — 31720 candle(s)
3. Provenance ledger: 0 records at run time (fresh state; populated by step c)
4. Promotion gates: 10 evaluated, 4 passing (paper data present)
5. Quality baseline: parsed OK — version 1.0.2

### b. Real data verification — PASS
- `loadCandles` (`src/alpha-lab/experiments/alpha-backtest-adapter.ts:46-77`): queries
  `getLatestCandles(market, timeframe, count, exchange='binance')` from Postgres
  `ohlcv_candles`; returns `source:'real'` iff ≥10 rows; falls back to
  `generateMockCandles` → `source:'mock'` only on empty store / DB error.
- Store was empty for BTC/USD binance 1h before run → populated via existing
  `src/desk/data/binance-feed.ts` CLI (real Binance public klines, no fabrication):
  `npx tsx src/desk/data/binance-feed.ts BTC/USD 1250 1h` → **30000 candles stored** (exit 0).
- Postgres verify: `SELECT COUNT(*) ... market='BTC/USD' AND exchange='binance' AND timeframe='1h'`
  → 30000 rows, range 2023-03-24 → 2026-08-25.

### c. Experiment run + record — PASS (exit 0)
`npx tsx src/alpha-lab/run-experiment.ts --config src/alpha-lab/configs/rsi-mean-reversion.json --record`
- **dataSource: "real"** (hard gate satisfied), totalBars: 30000
- splits: train/val/test present; test: 5984 trades, winRate 19.9%, totalPnl -13.73, sharpe -10.77
- regimesPresent: LOW_VOLATILITY, RANGE, TREND_DOWN, TREND_UP, UNKNOWN
- baselines: buy-and-hold, random-entry, simple-momentum, simple-mean-reversion
- run card: `data/runs/rsi-mean-reversion-btc-1h/run_card.json` (+ .md)
  - configHash: `5790bf4431b631fd8d060b42bfa10d0f75922c1de663395ef19003b3e6da6343`
- ledger verdict: `data/research-ledger.jsonl` (1 record) —
  `{"runId":"rsi-mean-reversion-btc-1h","configHash":"5790bf44…","resultClass":"IS","gates":{"alphaSurvival":false}}`
- stderr: `{"recorded":true,"alphaSurvival":false,"candidateId":"rsi-mean-reversion-btc-1h","ledgerOk":true}`
- Honest note: alpha did NOT survive (negative Sharpe/PnL on real data) — this is a truthful
  rejection, not a failure of the acceptance flow. No profitability claim made.

### d. Walkforward + robustness via CLI — PASS (both exit 0)
- `cashclaw alpha walkforward rsi-mean-reversion-btc-1h` → exit 0; header "Source: real";
  1 step table (Train SR -19.28 / Val SR -25.36 / Test SR -24.78), overfit gap 1.4%.
- `cashclaw alpha robustness rsi-mean-reversion-btc-1h` → exit 0; **4 stress rows incl. new EXTREME**:
  - NORMAL (5/3 bps) totalPnl -14.93
  - CONSERVATIVE (10/8) -26.90
  - ADVERSE (20/20) -53.23
  - **EXTREME (30/25) -71.18** ← G1 closure evidence, mode flows through `listStressModes()`

### e. Gates — runs, honest table (exit 1 by design)
`npx tsx src/alpha-lab/check-gates.ts` → exit 1. Gate table printed truthfully:
4/10 gates passing (Trades 857≥50 PASS, Sharpe 3.87≥1 PASS, Kelly wired PASS, Circuit breaker PASS;
Duration 7d<30d, WinRate 27.2%<55%, PF 0<1.3, MaxDD 1587.5%>15%, OOS N/A, Exchange connectivity No → FAIL).
Exit 1 is correct per `check-gates.ts:207` (`process.exit(reading.allPassed ? 0 : 1)`) — gates not
all passing on paper data; plan AC "runs; prints honest gate table" satisfied. Not a defect.

### f. Promotion state machine — paper-only confirmed, no LIVE promotion attempted
- No LIVE promotion executed (by design).
- Gate/transition test subset: `npx vitest run src/alpha-lab/attribution src/alpha-lab/gates
  src/alpha-lab/__tests__/gate-evaluator.test.ts src/alpha-lab/validation/__tests__/gate-evaluator.test.ts`
  → 3 files / 30 tests passed (exit 0). Full-suite run also covers these.
- FINDING (non-blocking): `src/alpha-lab/attribution/promotion-state-machine.ts` has NO dedicated
  unit test file (repo-wide grep: zero importers incl. tests). Its transitions are only indirectly
  represented via gate-evaluator tests + doctor check #4. Coverage gap — recommend dedicated tests.

## 3. BLOCKED statement (verbatim)

funding-rate mean reversion E2E is BLOCKED: no funding/OI historical data source exists in repo (scout: src/desk/data/ = candles+sentiment only); DERIV DEFERRED stands.

## 4. Constraints honored

- No git commands run. No code modified. No data fabricated (all candles from Binance public API
  via repo's own binance-feed.ts). No mocks accepted as acceptance evidence.

## Unresolved questions

1. Should promotion-state-machine.ts get a dedicated unit test file (coverage gap, finding 2f)?
2. check-gates exit 1 treated as acceptable per plan wording ("chạy được, in gate table trung thực") — confirm orchestrator agrees exit≠0 is not a B4 failure.
