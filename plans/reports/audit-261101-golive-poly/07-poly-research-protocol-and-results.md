# 07 — Polymarket Research Protocol & Results (`audit-261101-golive-poly`)

## 1. Walk-Forward & Out-of-Sample Protocol (`src/desk/polymarket/polymarket-oos-evaluator.ts`)
- **Reproduction Command:**
  ```bash
  npx tsx -e "import { runPolymarketWalkForwardEvaluation } from './src/desk/polymarket/polymarket-oos-evaluator'; console.log(JSON.stringify(runPolymarketWalkForwardEvaluation({ seed: 42, episodes: 120 }), null, 2));"
  ```
- **Dataset Split:** `120` deterministic market episodes (`seed = 42`, category `politics`):
  - **In-Sample (IS):** `84` episodes (`70%`)
  - **Out-of-Sample (OOS):** `36` episodes (`30%`)
  - **Stressed OOS Regime:** Wider bid-ask half-spread (`1.1%–1.9%`), `35%` thin orderbook depth (`15` tokens vs `25` required), and `16%` Leg-2 rejection rate requiring immediate IOC unwind of Leg 1 at `yesBid` plus taker exit fees.

## 2. Candidate Comparison Table (`seed = 42`, `episodes = 120`, `legSizeUsdc = 25`)

| Candidate | IS Trades | IS Net PnL (USDC) | OOS Trades | OOS Gross PnL (USDC) | OOS Fees (USDC) | OOS Unwind Loss (USDC) | OOS Net PnL (USDC) | OOS Win Rate | Stressed OOS Net PnL (USDC) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `no_trade_baseline` | `0` | `0.0000` | `0` | `0.0000` | `0.0000` | `0.0000` | `0.0000` | `0.00%` | `0.0000` |
| `naive_mid_arb` | `29` | `+10.1457` | `15` | `+8.3551` | `1.1994` | `0.4135` | `+6.7422` | `66.67%` | `-4.4313` |
| `executable_ask_fee_arb` | `18` | `+12.0972` | `9` | `+8.3075` | `0.6952` | `0.4135` | `+7.1988` | `88.89%` | `-0.1680` |

## 3. Key Research Findings & Limitations
1. **Executable Ask + Depth + Fee Filtering (`executable_ask_fee_arb`) Outperforms Naive Midpoint (`naive_mid_arb`):**
   - In normal OOS, `executable_ask_fee_arb` filters out `6` false-edge/thin-book trades (`9` vs `15` trades), cutting fees by `42%` (`$0.6952` vs `$1.1994`), raising win rate from `66.67%` to `88.89%`, and increasing OOS net PnL (`+$7.1988` vs `+$6.7422`).
   - Under the stressed regime (wider spread + thin depth + `16%` Leg-2 failure), `naive_mid_arb` suffers heavy adverse selection (`-$4.4313`), whereas `executable_ask_fee_arb` rejects thin/unprofitable books and limits stressed drawdown to `-$0.1680`.
2. **Why Live Capital (`G2/G3`) Remains `BLOCKED`:**
   - Under stressed Leg-2 failure (`16%` rejection), even `executable_ask_fee_arb` has slightly negative expectancy (`-$0.1680`) due to bid-ask crossing on Leg-1 unwind. Real-market 30-day shadow telemetry (`G2`) is mandatory to measure empirical Leg-2 fill rate and latency before any live capital (`G3`) can be considered.

## 4. 30/30 Strategy Net-of-Fee Backtest Suite & Leaderboard (`Issue #238`)
- **Reproduction & Verification Commands:**
  ```bash
  npx vitest run src/desk/backtesting/__tests__/backtest-runner-simulation.test.ts
  npm run check:leaderboard
  ```
- **Summary (`reports/backtest-results.csv` & `docs/backtest-leaderboard.md`):**
  - All **30/30** registered Polymarket strategies complete `168`-tick (`30`-day hourly) multi-regime simulation with `status = OK`, `total_trades > 0` (`6` to `398` closed round-trip trades per strategy, `5,131` total closed round-trip trades across the suite), `0` `Infinity`/`NaN` metrics, and full venue cost deduction (`10 bps` taker fee per leg + `$0.05` gas per transaction via `BacktestOrderManager.applyVenueCosts`).
  - Top net-of-fee performers in the 30-strategy suite include `tail-risk-harvester` (`+$243.60` net PnL, `20` trades, Sharpe `34.42`), `recency-bias-exploiter` (`+$29.06` net PnL, `152` trades, Sharpe `11.85`), `time-weighted-mean-reversion` (`+$37.00` net PnL, `79` trades, Sharpe `9.67`), `vwap-deviation-sniper` (`+$32.57` net PnL, `73` trades, Sharpe `9.05`), and `orderbook-depth-ratio` (`+$114.64` net PnL, `124` trades, Sharpe `8.13`).
  - **Opt-In CLOB V2 Quadratic Taker Fee & Passive Maker Rebate Mode (`Issue #258`):** `applyVenueCosts` (`src/desk/backtesting/backtest-fee-application.ts`) and `BacktestOrderManager` (`src/desk/backtesting/backtest-order-manager.ts`) also support `{ clobV2Category?: PolymarketCategory, postOnly?: boolean }`, charging `calcQuadraticTakerFeeV2(category, entryPrice, size) + calcQuadraticTakerFeeV2(category, exitPrice, size)` on taker fills or crediting `calcMakerRebateV2(category, entryPrice, size) + calcMakerRebateV2(category, exitPrice, size)` with zero taker fee when `postOnly: true`, verified in `src/desk/__tests__/poly-v4-fifo-settlement-and-backtest-v2.test.ts`.
