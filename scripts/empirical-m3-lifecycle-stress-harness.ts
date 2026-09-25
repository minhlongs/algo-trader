/**
 * Standalone Empirical Stress-Test Harness for Milestone 3 Alpha-Lab
 * Target: AlphaLifecycleStateMachine (src/alpha-lab/attribution/alpha-lifecycle-state-machine.ts)
 *
 * Verifies:
 * 1. Boundary condition: exact maxDrawdown = 0.15 (passes/no retire) vs 0.1501 (retires).
 * 2. Sample size boundary: trade count 14 with negative PnL & low winRate (does NOT retire) vs trade count 15 (retires).
 * 3. Win rate boundary: win rate 0.45 (does not retire) vs 0.449 (retires when tradeCount >= 15 & netPnl < 0).
 * 4. OOS consistency gap divergence boundary: gap 0.10 (does not retire) vs 0.101 (retires).
 * 5. Absorbing state property: once RETIRED, multiple evaluate() calls, startPaperTrading(), and retire() cannot transition out.
 * 6. Promotion: all 10+1 criteria pass vs when exactly 1 criterion fails across all gates.
 */

import {
  AlphaLifecycleStateMachine,
  extractGateMetrics,
} from '../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import type { GateEvaluatorInput } from '../src/alpha-lab/gates/gate-evaluator-types';
import type { BacktestTrade } from '../src/desk/backtesting/types';

interface HarnessCheck {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const checks: HarnessCheck[] = [];

function recordCheck(id: string, name: string, passed: boolean, details: string): void {
  checks.push({ id, name, passed, details });
  const status = passed ? '[PASS]' : '[FAIL]';
  process.stdout.write(`${status} ${id}: ${name} — ${details}\n`);
}

function makeTrades(count: number, winCount: number, winPnl = 2000, lossPnl = -1000): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  for (let i = 0; i < count; i++) {
    const isWin = i < winCount;
    trades.push({
      id: `t-${i}`,
      strategyId: 'stress-strat',
      symbol: 'BTC/USDT',
      direction: 'BUY',
      entryPrice: 50000,
      exitPrice: isWin ? 52000 : 49000,
      size: 1,
      entryTime: 1700000000000 + i * 3600000,
      exitTime: 1700000000000 + i * 3600000 + 1800000,
      pnl: isWin ? winPnl : lossPnl,
      fees: 10,
    });
  }
  return trades;
}

function makePassingGateInput(): GateEvaluatorInput {
  const startDate = new Date(Date.now() - 35 * 86400000).toISOString(); // 35 days active (>= 30)
  const equityCurve: Array<{ timestamp: string; equity: number }> = [];
  let eq = 100000;
  for (let i = 0; i <= 35; i++) {
    eq += 300;
    equityCurve.push({
      timestamp: new Date(1700000000000 + i * 86400000).toISOString(),
      equity: eq,
    });
  }

  return {
    trades: makeTrades(55, 33), // 55 trades, 60% win rate (>= 55%), PF = 3.0 (>= 1.3)
    startDate,
    equityCurve,
    testWinRate: 0.58,
    valWinRate: 0.60, // gap = 0.02 (<= 0.05)
    flags: {
      kellyWired: true,
      circuitBreakerTested: true,
      exchangeConnectivityGreen: true,
    },
  };
}

export function runEmpiricalStressHarness(): { allPassed: boolean; total: number; passed: number; failed: number } {
  process.stdout.write('=================================================================\n');
  process.stdout.write('  EMPIRICAL STRESS-TEST HARNESS: AlphaLifecycleStateMachine\n');
  process.stdout.write('=================================================================\n\n');

  // ===========================================================================
  // TEST GROUP 1: Max Drawdown Boundary (0.1500 vs 0.1501)
  // ===========================================================================
  process.stdout.write('--- GROUP 1: Max Drawdown Boundary (0.1500 vs 0.1501) ---\n');
  {
    // Case 1A: Exact 0.1500 Max Drawdown
    const smPass = new AlphaLifecycleStateMachine('strat-dd-1500', 'PAPER_ACTIVE');
    const inputPass = makePassingGateInput();
    // Peak = 100,000, Trough = 85,000 -> DD = (100,000 - 85,000)/100,000 = 0.1500 exactly
    inputPass.equityCurve = [
      { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
      { timestamp: '2026-01-02T00:00:00.000Z', equity: 85000 },
      { timestamp: '2026-01-03T00:00:00.000Z', equity: 95000 },
    ];
    const metricsPass = extractGateMetrics(inputPass);
    const evalPass = smPass.evaluate(inputPass);
    const ddGatePass = evalPass.verdict.gates.find((g) => g.id === 'max_drawdown');

    const passOk =
      metricsPass.maxDrawdown === 0.15 &&
      ddGatePass?.passed === true &&
      evalPass.state !== 'RETIRED' &&
      !smPass.isRetired();

    recordCheck(
      'G1-DD-0.1500',
      'Exact maxDrawdown 0.15 passes gate and does NOT retire',
      passOk,
      `computedDD=${metricsPass.maxDrawdown}, gatePassed=${ddGatePass?.passed}, state=${evalPass.state}`,
    );

    // Case 1B: 0.1501 Max Drawdown (Breach)
    const smFail = new AlphaLifecycleStateMachine('strat-dd-1501', 'PAPER_ACTIVE');
    const inputFail = makePassingGateInput();
    // Peak = 100,000, Trough = 84,990 -> DD = (100,000 - 84,990)/100,000 = 0.1501
    inputFail.equityCurve = [
      { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
      { timestamp: '2026-01-02T00:00:00.000Z', equity: 84990 },
      { timestamp: '2026-01-03T00:00:00.000Z', equity: 95000 },
    ];
    const metricsFail = extractGateMetrics(inputFail);
    const evalFail = smFail.evaluate(inputFail);
    const ddGateFail = evalFail.verdict.gates.find((g) => g.id === 'max_drawdown');

    const failOk =
      metricsFail.maxDrawdown === 0.1501 &&
      ddGateFail?.passed === false &&
      evalFail.state === 'RETIRED' &&
      smFail.isRetired() &&
      evalFail.transition?.toState === 'RETIRED' &&
      /drawdown breach/i.test(evalFail.transition.reason);

    recordCheck(
      'G1-DD-0.1501',
      'Exact maxDrawdown 0.1501 fails gate and triggers RETIRED',
      failOk,
      `computedDD=${metricsFail.maxDrawdown}, gatePassed=${ddGateFail?.passed}, state=${evalFail.state}, reason="${evalFail.transition?.reason}"`,
    );
  }

  // ===========================================================================
  // TEST GROUP 2: Sample Size Boundary for Expectancy Retirement (14 vs 15)
  // ===========================================================================
  process.stdout.write('\n--- GROUP 2: Sample Size Boundary for Negative Expectancy (14 vs 15) ---\n');
  {
    // Case 2A: 14 trades with negative net PnL & low win rate
    const sm14 = new AlphaLifecycleStateMachine('strat-trade-14', 'PAPER_ACTIVE');
    const input14 = makePassingGateInput();
    // 14 trades: 4 wins ($100 each), 10 losses (-$200 each)
    // winRate = 4/14 = 28.57% (< 45%), totalNetPnl = 400 - 2000 = -1600 (< 0)
    input14.trades = makeTrades(14, 4, 100, -200);
    const metrics14 = extractGateMetrics(input14);
    const eval14 = sm14.evaluate(input14);

    const ok14 =
      metrics14.tradeCount === 14 &&
      metrics14.totalNetPnl < 0 &&
      metrics14.winRate < 0.45 &&
      eval14.state === 'PAPER_ACTIVE' &&
      !sm14.isRetired();

    recordCheck(
      'G2-SAMPLE-14',
      'Trade count 14 with negative PnL & low winRate does NOT retire',
      ok14,
      `trades=${metrics14.tradeCount}, pnl=${metrics14.totalNetPnl}, winRate=${metrics14.winRate}, state=${eval14.state}`,
    );

    // Case 2B: 15 trades with negative net PnL & low win rate
    const sm15 = new AlphaLifecycleStateMachine('strat-trade-15', 'PAPER_ACTIVE');
    const input15 = makePassingGateInput();
    // 15 trades: 4 wins ($100 each), 11 losses (-$200 each)
    // winRate = 4/15 = 26.67% (< 45%), totalNetPnl = 400 - 2200 = -1800 (< 0)
    input15.trades = makeTrades(15, 4, 100, -200);
    const metrics15 = extractGateMetrics(input15);
    const eval15 = sm15.evaluate(input15);

    const ok15 =
      metrics15.tradeCount === 15 &&
      metrics15.totalNetPnl < 0 &&
      metrics15.winRate < 0.45 &&
      eval15.state === 'RETIRED' &&
      sm15.isRetired() &&
      eval15.transition?.toState === 'RETIRED' &&
      /persistent negative expectancy/i.test(eval15.transition.reason);

    recordCheck(
      'G2-SAMPLE-15',
      'Trade count 15 with negative PnL & low winRate triggers RETIRED',
      ok15,
      `trades=${metrics15.tradeCount}, pnl=${metrics15.totalNetPnl}, winRate=${metrics15.winRate}, state=${eval15.state}, reason="${eval15.transition?.reason}"`,
    );
  }

  // ===========================================================================
  // TEST GROUP 3: Win Rate Boundary at Sample Size >= 15 & Negative Net PnL
  // ===========================================================================
  process.stdout.write('\n--- GROUP 3: Win Rate Boundary (0.4500 vs 0.4490) ---\n');
  {
    // Case 3A: Win Rate = exact 0.4500 (20 trades: 9 wins, 11 losses, net negative PnL)
    const sm45 = new AlphaLifecycleStateMachine('strat-wr-450', 'PAPER_ACTIVE');
    const input45 = makePassingGateInput();
    // 20 trades: 9 wins ($10 each = $90), 11 losses (-$20 each = -$220), net = -$130
    input45.trades = makeTrades(20, 9, 10, -20);
    const metrics45 = extractGateMetrics(input45);
    const eval45 = sm45.evaluate(input45);

    const ok45 =
      metrics45.tradeCount === 20 &&
      metrics45.winRate === 0.45 &&
      metrics45.totalNetPnl < 0 &&
      eval45.state === 'PAPER_ACTIVE' &&
      !sm45.isRetired();

    recordCheck(
      'G3-WR-0.4500',
      'Exact winRate 0.45 with trades >= 15 and netPnl < 0 does NOT retire',
      ok45,
      `winRate=${metrics45.winRate}, pnl=${metrics45.totalNetPnl}, state=${eval45.state}`,
    );

    // Case 3B: Win Rate = 0.4490 (1000 trades: 449 wins, 551 losses, net negative PnL)
    const sm449 = new AlphaLifecycleStateMachine('strat-wr-449', 'PAPER_ACTIVE');
    const input449 = makePassingGateInput();
    // 1000 trades: 449 wins ($1 each), 551 losses (-$2 each), net = 449 - 1102 = -653
    input449.trades = makeTrades(1000, 449, 1, -2);
    const metrics449 = extractGateMetrics(input449);
    const eval449 = sm449.evaluate(input449);

    const ok449 =
      metrics449.tradeCount === 1000 &&
      metrics449.winRate === 0.449 &&
      metrics449.totalNetPnl < 0 &&
      eval449.state === 'RETIRED' &&
      sm449.isRetired() &&
      eval449.transition?.toState === 'RETIRED' &&
      /persistent negative expectancy/i.test(eval449.transition.reason);

    recordCheck(
      'G3-WR-0.4490',
      'WinRate 0.4490 with trades >= 15 and netPnl < 0 triggers RETIRED',
      ok449,
      `winRate=${metrics449.winRate}, pnl=${metrics449.totalNetPnl}, state=${eval449.state}, reason="${eval449.transition?.reason}"`,
    );
  }

  // ===========================================================================
  // TEST GROUP 4: OOS Consistency Gap Divergence Boundary (0.1000 vs 0.1010)
  // ===========================================================================
  process.stdout.write('\n--- GROUP 4: OOS Consistency Gap Divergence Boundary (0.1000 vs 0.1010) ---\n');
  {
    // Case 4A: Exact 0.1000 OOS gap
    const smOos100 = new AlphaLifecycleStateMachine('strat-oos-100', 'PAPER_ACTIVE');
    const inputOos100 = makePassingGateInput();
    inputOos100.valWinRate = 0.65;
    inputOos100.testWinRate = 0.55; // gap = 0.65 - 0.55 = 0.1000
    const metricsOos100 = extractGateMetrics(inputOos100);
    const evalOos100 = smOos100.evaluate(inputOos100);

    // OOS gate threshold is 0.05, so the gate itself fails, but it must NOT retire (> 0.10 required)
    const oosGate100 = evalOos100.verdict.gates.find((g) => g.id === 'oos_consistency');
    const okOos100 =
      metricsOos100.oosGap !== null &&
      Math.abs(metricsOos100.oosGap - 0.10) < 1e-9 &&
      oosGate100?.passed === false &&
      evalOos100.state === 'PAPER_ACTIVE' &&
      !smOos100.isRetired();

    recordCheck(
      'G4-OOS-0.1000',
      'Exact OOS gap 0.10 fails gate but does NOT trigger RETIRED',
      okOos100,
      `oosGap=${metricsOos100.oosGap?.toFixed(4)}, gatePassed=${oosGate100?.passed}, state=${evalOos100.state}`,
    );

    // Case 4B: 0.1010 OOS gap (> 0.10 breach)
    const smOos101 = new AlphaLifecycleStateMachine('strat-oos-101', 'PAPER_ACTIVE');
    const inputOos101 = makePassingGateInput();
    inputOos101.valWinRate = 0.651;
    inputOos101.testWinRate = 0.55; // gap = 0.651 - 0.55 = 0.1010
    const metricsOos101 = extractGateMetrics(inputOos101);
    const evalOos101 = smOos101.evaluate(inputOos101);

    const okOos101 =
      metricsOos101.oosGap !== null &&
      Math.abs(metricsOos101.oosGap - 0.101) < 1e-6 &&
      evalOos101.state === 'RETIRED' &&
      smOos101.isRetired() &&
      evalOos101.transition?.toState === 'RETIRED' &&
      /OOS consistency divergence/i.test(evalOos101.transition.reason);

    recordCheck(
      'G4-OOS-0.1010',
      'OOS gap 0.1010 triggers immediate RETIRED transition',
      okOos101,
      `oosGap=${metricsOos101.oosGap?.toFixed(4)}, state=${evalOos101.state}, reason="${evalOos101.transition?.reason}"`,
    );
  }

  // ===========================================================================
  // TEST GROUP 5: Absorbing State Property of RETIRED
  // ===========================================================================
  process.stdout.write('\n--- GROUP 5: Absorbing State Property of RETIRED ---\n');
  {
    const smAbs = new AlphaLifecycleStateMachine('strat-absorbing', 'PAPER_ACTIVE');

    // Step 1: Force transition to RETIRED via manual retire()
    const trans1 = smAbs.retire('Initial retirement for absorbing state test');
    const step1Ok = smAbs.getState() === 'RETIRED' && smAbs.isRetired() && trans1.toState === 'RETIRED';

    // Step 2: Multiple evaluate() calls with pristine passing inputs
    let multiEvalOk = true;
    const initialHistoryLength = smAbs.getHistory().length;
    for (let i = 0; i < 5; i++) {
      const passingInput = makePassingGateInput();
      const res = smAbs.evaluate(passingInput);
      if (res.state !== 'RETIRED' || res.transition !== undefined || smAbs.getState() !== 'RETIRED' || smAbs.isLiveEligible()) {
        multiEvalOk = false;
        break;
      }
    }
    const historyUnchanged = smAbs.getHistory().length === initialHistoryLength;

    // Step 3: Attempt startPaperTrading() on RETIRED strategy -> must throw
    let startThrewExpected = false;
    try {
      smAbs.startPaperTrading();
    } catch (err) {
      startThrewExpected = err instanceof Error && /absorbing state/i.test(err.message);
    }

    // Step 4: Attempt retire() again on RETIRED strategy -> must throw
    let retireThrewExpected = false;
    try {
      smAbs.retire('Secondary retirement attempt');
    } catch (err) {
      retireThrewExpected = err instanceof Error && /already RETIRED/i.test(err.message);
    }

    // Step 5: Final state verification
    const finalStateOk = smAbs.getState() === 'RETIRED' && smAbs.isRetired() && !smAbs.isLiveEligible();

    const absorbingOk = step1Ok && multiEvalOk && historyUnchanged && startThrewExpected && retireThrewExpected && finalStateOk;

    recordCheck(
      'G5-ABSORBING',
      'RETIRED is absorbing: evaluate(), startPaperTrading(), and retire() cannot exit RETIRED',
      absorbingOk,
      `step1=${step1Ok}, multiEval=${multiEvalOk}, historyLen=${initialHistoryLength}, startThrew=${startThrewExpected}, retireThrew=${retireThrewExpected}, final=${finalStateOk}`,
    );
  }

  // ===========================================================================
  // TEST GROUP 6: Promotion Criteria (All 10+1 Pass vs Exactly 1 Fails)
  // ===========================================================================
  process.stdout.write('\n--- GROUP 6: Promotion (All 10+1 Pass vs 1 Fails) ---\n');
  {
    // Test 6.1: All 10 canonical gates pass -> Promotes to PROMOTED_LIVE_ELIGIBLE
    const sm10 = new AlphaLifecycleStateMachine('strat-all-10', 'PAPER_ACTIVE');
    const input10 = makePassingGateInput();
    const eval10 = sm10.evaluate(input10);

    const ok10 =
      eval10.state === 'PROMOTED_LIVE_ELIGIBLE' &&
      eval10.verdict.allPassed === true &&
      eval10.verdict.totalGates === 10 &&
      eval10.verdict.passedCount === 10 &&
      sm10.isLiveEligible() &&
      eval10.transition?.toState === 'PROMOTED_LIVE_ELIGIBLE';

    recordCheck(
      'G6-ALL-10-PASS',
      'Promotes to PROMOTED_LIVE_ELIGIBLE when all 10 canonical gates pass',
      ok10,
      `state=${eval10.state}, passed=${eval10.verdict.passedCount}/${eval10.verdict.totalGates}`,
    );

    // Test 6.2: All 10 + 1 (with Statistical Significance) pass -> Promotes
    const sm11 = new AlphaLifecycleStateMachine('strat-all-11', 'PAPER_ACTIVE');
    const input11 = makePassingGateInput();
    input11.statisticalValidation = {
      pValueSharpe: 0.02,
      sharpeCiLower: 0.75,
      sharpeCiUpper: 2.10,
    };
    const eval11 = sm11.evaluate(input11);

    const ok11 =
      eval11.state === 'PROMOTED_LIVE_ELIGIBLE' &&
      eval11.verdict.allPassed === true &&
      eval11.verdict.totalGates === 11 &&
      eval11.verdict.passedCount === 11 &&
      sm11.isLiveEligible() &&
      eval11.transition?.toState === 'PROMOTED_LIVE_ELIGIBLE';

    recordCheck(
      'G6-ALL-11-PASS',
      'Promotes to PROMOTED_LIVE_ELIGIBLE when all 10 canonical + statistical gate pass',
      ok11,
      `state=${eval11.state}, passed=${eval11.verdict.passedCount}/${eval11.verdict.totalGates}`,
    );

    // Test 6.3: Isolation matrix: Exactly ONE criterion fails
    const singleGateFailureCases: Array<{
      name: string;
      modify: (input: GateEvaluatorInput) => void;
      expectedFailedGate: string;
    }> = [
      {
        name: 'Duration < 30 days (29 days)',
        modify: (inp) => {
          inp.startDate = new Date(Date.now() - 29 * 86400000).toISOString();
        },
        expectedFailedGate: 'duration',
      },
      {
        name: 'Trade count < 50 (49 trades)',
        modify: (inp) => {
          inp.trades = makeTrades(49, 32); // 49 trades, win rate = 65%
        },
        expectedFailedGate: 'trade_count',
      },
      {
        name: 'Win rate < 55% (54% with positive PnL)',
        modify: (inp) => {
          // 50 trades, 27 wins (54%), winPnl 2000, lossPnl -1000 -> net = 54000 - 23000 = +31000
          inp.trades = makeTrades(50, 27, 2000, -1000);
        },
        expectedFailedGate: 'win_rate',
      },
      {
        name: 'Profit factor < 1.30 (1.20 with positive PnL)',
        modify: (inp) => {
          // 50 trades, 30 wins ($400 each = $12000), 20 losses (-$500 each = -$10000)
          // PF = 12000 / 10000 = 1.20 < 1.30, net PnL = +2000 > 0
          inp.trades = makeTrades(50, 30, 400, -500);
        },
        expectedFailedGate: 'profit_factor',
      },
      {
        name: 'Sharpe ratio < 1.0 (Flat equity curve, std = 0)',
        modify: (inp) => {
          // Flat equity curve has zero variance -> Sharpe = 0 < 1.0
          inp.equityCurve = [
            { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
            { timestamp: '2026-01-02T00:00:00.000Z', equity: 100000 },
            { timestamp: '2026-01-03T00:00:00.000Z', equity: 100000 },
          ];
        },
        expectedFailedGate: 'sharpe_ratio',
      },
      {
        name: 'OOS consistency gap > 0.05 but <= 0.10 (gap = 0.08)',
        modify: (inp) => {
          inp.valWinRate = 0.64;
          inp.testWinRate = 0.56; // gap = 0.08 > 0.05 (fails gate) but <= 0.10 (no retirement)
        },
        expectedFailedGate: 'oos_consistency',
      },
      {
        name: 'Kelly Criterion not wired (false)',
        modify: (inp) => {
          inp.flags = { ...inp.flags, kellyWired: false };
        },
        expectedFailedGate: 'kelly_wired',
      },
      {
        name: 'Circuit breaker not tested (false)',
        modify: (inp) => {
          inp.flags = { ...inp.flags, circuitBreakerTested: false };
        },
        expectedFailedGate: 'circuit_breaker',
      },
      {
        name: 'Exchange connectivity not green (false)',
        modify: (inp) => {
          inp.flags = { ...inp.flags, exchangeConnectivityGreen: false };
        },
        expectedFailedGate: 'exchange_connectivity',
      },
      {
        name: 'Statistical p-value >= 0.05 (0.08)',
        modify: (inp) => {
          inp.statisticalValidation = {
            pValueSharpe: 0.08,
            sharpeCiLower: 0.5,
            sharpeCiUpper: 2.0,
          };
        },
        expectedFailedGate: 'statistical_significance',
      },
      {
        name: 'Statistical Sharpe CI lower bound <= 0 (-0.15)',
        modify: (inp) => {
          inp.statisticalValidation = {
            pValueSharpe: 0.02,
            sharpeCiLower: -0.15,
            sharpeCiUpper: 1.8,
          };
        },
        expectedFailedGate: 'statistical_significance',
      },
    ];

    for (const testCase of singleGateFailureCases) {
      const smSingle = new AlphaLifecycleStateMachine(`strat-fail-${testCase.expectedFailedGate}`, 'PAPER_ACTIVE');
      const inputSingle = makePassingGateInput();
      testCase.modify(inputSingle);
      const evalSingle = smSingle.evaluate(inputSingle);

      const failedGates = evalSingle.verdict.gates.filter((g) => !g.passed);
      const singleGateFailed =
        failedGates.length === 1 &&
        failedGates[0].id === testCase.expectedFailedGate &&
        evalSingle.verdict.allPassed === false &&
        evalSingle.state === 'PAPER_ACTIVE' &&
        evalSingle.transition === undefined &&
        !smSingle.isLiveEligible();

      recordCheck(
        `G6-FAIL-${testCase.expectedFailedGate.toUpperCase()}`,
        `Fails promotion when ONLY "${testCase.name}" fails`,
        singleGateFailed,
        `failedGates=[${failedGates.map((g) => g.id).join(',')}], allPassed=${evalSingle.verdict.allPassed}, state=${evalSingle.state}`,
      );
    }
  }

  // ===========================================================================
  // Summary
  // ===========================================================================
  const total = checks.length;
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  const allPassed = failed === 0;

  process.stdout.write('\n=================================================================\n');
  process.stdout.write(`  HARNESS COMPLETE: ${passed}/${total} checks passed (${failed} failed)\n`);
  process.stdout.write(`  VERDICT: ${allPassed ? 'ALL ADVERSARIAL STRESS-TESTS PASSED' : 'FAILURES DETECTED'}\n`);
  process.stdout.write('=================================================================\n');

  return { allPassed, total, passed, failed };
}

// Run immediately if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runEmpiricalStressHarness();
  process.exit(result.allPassed ? 0 : 1);
}
