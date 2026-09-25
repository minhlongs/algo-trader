/**
 * Empirical Challenger M2 Adversarial Verification Harness
 *
 * Independently stress-tests:
 * 1. NaN / non-finite / corrupt input immunity across all risk & routing gates.
 * 2. TieredDrawdownBreaker catastrophic escalation to HARD_STOP under active halt/pause timers.
 * 3. Terminal state guarantees of HARD_STOP.
 * 4. Fuzzing of malformed inputs into AISignalAdapter, RegimeAwareKelly, Router, and PaperExecutor.
 * 5. Concurrent routing safety.
 */

import { AISignalAdapter, candidateToAISignal, type AISignal } from '../src/desk/strategies/ai-signal-adapter';
import { AISignalPaperRouter } from '../src/desk/strategies/ai-signal-paper-router';
import { PaperExecutor } from '../src/desk/execution/paper-executor';
import { sizeSignalToTradeSignal, RegimeAwareKelly } from '../src/desk/risk/regime-aware-kelly';
import { TieredDrawdownBreaker } from '../src/desk/risk/tiered-drawdown-breaker';
import type { DiscoveredAlphaCandidate } from '../src/alpha-lab/alpha-discovery/continuous-discovery-types';

process.env.VITEST_POOL_ID = '1';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, suite: string, name: string, details?: string): void {
  results.push({
    suite,
    name,
    passed: condition,
    details: condition ? undefined : details ?? 'Assertion failed',
  });
  if (!condition) {
    console.error(`[FAIL] [${suite}] ${name}: ${details ?? 'Assertion failed'}`);
  } else {
    console.log(`[PASS] [${suite}] ${name}`);
  }
}

async function runAdversarialVerification() {
  console.log('=== EMPIRICAL CHALLENGER ADVERSARIAL VERIFICATION START ===\n');

  // =========================================================================
  // SUITE 1: Task 4 — TieredDrawdownBreaker Catastrophic Escalation
  // =========================================================================
  console.log('--- SUITE 1: TieredDrawdownBreaker Catastrophic Escalation ---');

  // Test 1.1: HALT -> HARD_STOP escalation during active haltedUntil window
  {
    const breaker = new TieredDrawdownBreaker(100_000, {
      alertThreshold: 0.05,
      reduceThreshold: 0.10,
      haltThreshold: 0.15,
      hardStopThreshold: 0.20,
      haltDurationMs: 48 * 3600 * 1000,
    });
    breaker.reset(100_000);

    // Trigger HALT at 16% drawdown
    const stateHalt = breaker.update(84_000);
    assert(stateHalt.tier === 'HALT', 'DrawdownBreaker', 'Enters HALT tier at 16% drawdown');
    assert(stateHalt.haltedUntil !== null && stateHalt.haltedUntil > Date.now(), 'DrawdownBreaker', 'Sets active haltedUntil timer');
    assert(breaker.canOpenNewTrades() === false, 'DrawdownBreaker', 'Blocks new trades while in HALT');
    assert(breaker.getPositionsToCloseFraction() === 0.5, 'DrawdownBreaker', 'HALT specifies closing 50% of positions');

    // Catastrophic collapse to 25% drawdown while haltedUntil is active
    const stateHardStop = breaker.update(75_000);
    assert(stateHardStop.tier === 'HARD_STOP', 'DrawdownBreaker', 'Properly escalates to HARD_STOP during catastrophic drop even when haltedUntil is active');
    assert(stateHardStop.haltedUntil === null, 'DrawdownBreaker', 'Clears haltedUntil timer upon escalating to HARD_STOP');
    assert(breaker.canOpenNewTrades() === false, 'DrawdownBreaker', 'canOpenNewTrades() remains false in HARD_STOP');
    assert(breaker.getPositionsToCloseFraction() === 1.0, 'DrawdownBreaker', 'HARD_STOP specifies 100% position liquidation');
    assert(breaker.getSizingMultiplier() === 0, 'DrawdownBreaker', 'HARD_STOP specifies 0 sizing multiplier');

    // Terminal nature of HARD_STOP
    const stateRebound = breaker.update(95_000);
    assert(stateRebound.tier === 'HARD_STOP', 'DrawdownBreaker', 'HARD_STOP is terminal; market rebound cannot exit without manual reset');

    breaker.reset(100_000);
    assert(breaker.getState().tier === 'NORMAL', 'DrawdownBreaker', 'reset() successfully restores NORMAL tier');
  }

  // Test 1.2: DAILY_PAUSE -> HARD_STOP escalation during active dailyPausedUntil window
  {
    const breaker = new TieredDrawdownBreaker(100_000, {
      alertThreshold: 0.05,
      reduceThreshold: 0.10,
      haltThreshold: 0.15,
      hardStopThreshold: 0.20,
      dailyLossThreshold: 0.03,
      dailyPauseDurationMs: 24 * 3600 * 1000,
    });
    breaker.reset(100_000);

    // Drop 4% daily loss (dd = 0.04 < 0.05 alertThreshold, dailyDd = 0.04 >= 0.03 dailyLossThreshold) -> DAILY_PAUSE
    const statePause = breaker.update(96_000);
    assert(statePause.tier === 'DAILY_PAUSE', 'DrawdownBreaker', 'Enters DAILY_PAUSE tier on 4% daily loss');
    assert(statePause.dailyPausedUntil !== null && statePause.dailyPausedUntil > Date.now(), 'DrawdownBreaker', 'Sets active dailyPausedUntil timer');

    // Catastrophic total drop to 25% while in DAILY_PAUSE
    const stateHardStop = breaker.update(75_000);
    assert(stateHardStop.tier === 'HARD_STOP', 'DrawdownBreaker', 'Escalates from DAILY_PAUSE to HARD_STOP during catastrophic drop');
    assert(stateHardStop.dailyPausedUntil === null, 'DrawdownBreaker', 'Clears dailyPausedUntil timer upon escalating to HARD_STOP');
    assert(breaker.getPositionsToCloseFraction() === 1.0, 'DrawdownBreaker', 'HARD_STOP specifies 100% position liquidation');
  }

  // Test 1.3: Non-finite inputs to DrawdownBreaker
  {
    const breaker = new TieredDrawdownBreaker(100_000);
    breaker.reset(100_000);

    const s1 = breaker.update(NaN);
    assert(s1.currentValue === 100_000 && !isNaN(s1.drawdownPercent), 'DrawdownBreaker', 'Ignores NaN value without corrupting state');

    const s2 = breaker.update(Infinity);
    assert(s2.currentValue === 100_000, 'DrawdownBreaker', 'Ignores Infinity value without corrupting state');

    const s3 = breaker.update(-50_000);
    assert(s3.currentValue === 100_000, 'DrawdownBreaker', 'Ignores negative value without corrupting state');
  }

  // =========================================================================
  // SUITE 2: Task 3 — NaN / Non-Finite Immunity Across Risk & Execution Gates
  // =========================================================================
  console.log('\n--- SUITE 2: NaN / Non-Finite Immunity Across Risk & Execution Gates ---');

  const adapter = new AISignalAdapter({
    confidenceThreshold: 0.70,
    minExpectancy: 0.02,
    regimeFilter: ['TREND_UP', 'RANGE'],
  });

  // Test 2.1: AISignalAdapter.validateSignal with malformed & extreme primitives
  {
    const badSignals: Array<{ desc: string; sig: unknown }> = [
      { desc: 'null signal', sig: null },
      { desc: 'undefined signal', sig: undefined },
      { desc: 'string signal', sig: 'invalid' },
      { desc: 'number signal', sig: 42 },
      { desc: 'empty object signal', sig: {} },
      { desc: 'NaN confidence', sig: { confidence: NaN, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'Infinity confidence', sig: { confidence: Infinity, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: '-Infinity confidence', sig: { confidence: -Infinity, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'negative confidence', sig: { confidence: -0.5, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'confidence > 1.0', sig: { confidence: 1.5, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'null confidence', sig: { confidence: null, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'undefined confidence', sig: { confidence: undefined, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'NaN expectancy', sig: { confidence: 0.8, expectancy: NaN, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'Infinity expectancy', sig: { confidence: 0.8, expectancy: Infinity, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: '-Infinity expectancy', sig: { confidence: 0.8, expectancy: -Infinity, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'null expectancy', sig: { confidence: 0.8, expectancy: null, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'undefined expectancy', sig: { confidence: 0.8, expectancy: undefined, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'negative expectancy', sig: { confidence: 0.8, expectancy: -0.05, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'expectancy below minimum', sig: { confidence: 0.8, expectancy: 0.01, regime: 'TREND_UP', timestamp: Date.now() } },
      { desc: 'disallowed regime', sig: { confidence: 0.8, expectancy: 0.05, regime: 'TREND_DOWN', timestamp: Date.now() } },
      { desc: 'SHOCK regime', sig: { confidence: 0.8, expectancy: 0.05, regime: 'SHOCK', timestamp: Date.now() } },
    ];

    for (const { desc, sig } of badSignals) {
      let valResult;
      let evalResult;
      let filterResult;
      try {
        valResult = adapter.validateSignal(sig as AISignal);
        evalResult = adapter.evaluateSignal(sig as AISignal);
        filterResult = adapter.filterByRegime(sig as AISignal);
      } catch (err: unknown) {
        assert(false, 'AISignalAdapter', `validateSignal/evaluateSignal threw exception on ${desc}: ${(err as Error).message}`);
        continue;
      }
      assert(valResult.valid === false, 'AISignalAdapter', `validateSignal safely rejects ${desc}`);
      if (desc.includes('regime')) {
        assert(filterResult === false, 'AISignalAdapter', `filterByRegime returns false for ${desc}`);
      } else {
        assert(evalResult === false, 'AISignalAdapter', `evaluateSignal safely returns false for ${desc}`);
      }
      assert(valResult.rejectionReasons.length > 0, 'AISignalAdapter', `validateSignal provides rejection diagnostic for ${desc}`);
    }
  }

  // Test 2.2: candidateToAISignal sanitization
  {
    const candidateCorrupt: DiscoveredAlphaCandidate = {
      strategyId: 'corrupt-candidate',
      familyId: 'momentum',
      config: { symbol: 'ETH/USDT' } as any,
      walkforwardSummary: {
        testWinRate: NaN,
        totalTestTrades: NaN,
        testTotalPnl: NaN,
      } as any,
      survivalGateResult: { passed: false, reasons: [] } as any,
      status: 'REJECTED',
    };

    const sanitizedSig = candidateToAISignal(candidateCorrupt, 'TREND_UP', 'BUY');
    assert(Number.isFinite(sanitizedSig.confidence) && sanitizedSig.confidence >= 0 && sanitizedSig.confidence <= 1,
      'candidateToAISignal', 'Sanitizes NaN testWinRate to finite [0, 1] range (0)');
    assert(Number.isFinite(sanitizedSig.expectancy) && sanitizedSig.expectancy >= 0,
      'candidateToAISignal', 'Sanitizes NaN testTotalPnl / totalTestTrades to finite expectancy (0)');
  }

  // Test 2.3: sizeSignalToTradeSignal non-finite & edge case handling
  {
    const validSignal: AISignal = {
      direction: 'BUY',
      confidence: 0.80,
      expectancy: 0.05,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };

    const edgeCases: Array<{ desc: string; opts: any; expectedQty: number }> = [
      { desc: 'portfolioEquity = NaN', opts: { portfolioEquity: NaN, currentPrice: 50_000 }, expectedQty: 0 },
      { desc: 'portfolioEquity = Infinity', opts: { portfolioEquity: Infinity, currentPrice: 50_000 }, expectedQty: 0 },
      { desc: 'portfolioEquity = 0', opts: { portfolioEquity: 0, currentPrice: 50_000 }, expectedQty: 0 },
      { desc: 'portfolioEquity = -1000', opts: { portfolioEquity: -1000, currentPrice: 50_000 }, expectedQty: 0 },
      { desc: 'currentPrice = NaN', opts: { portfolioEquity: 10_000, currentPrice: NaN }, expectedQty: 0 },
      { desc: 'currentPrice = Infinity', opts: { portfolioEquity: 10_000, currentPrice: Infinity }, expectedQty: 0 },
      { desc: 'currentPrice = 0', opts: { portfolioEquity: 10_000, currentPrice: 0 }, expectedQty: 0 },
      { desc: 'currentPrice = -500', opts: { portfolioEquity: 10_000, currentPrice: -500 }, expectedQty: 0 },
    ];

    for (const { desc, opts, expectedQty } of edgeCases) {
      const res = sizeSignalToTradeSignal(validSignal, opts);
      assert(res.quantity === expectedQty, 'sizeSignalToTradeSignal', `Returns quantity=${expectedQty} when ${desc}`);
    }

    // Signal parameter corruptions
    const signalCorruptions: Array<{ desc: string; sig: AISignal; expectedQty: number }> = [
      { desc: 'signal.confidence = NaN', sig: { ...validSignal, confidence: NaN }, expectedQty: 0 },
      { desc: 'signal.confidence = 0', sig: { ...validSignal, confidence: 0 }, expectedQty: 0 },
      { desc: 'signal.confidence = 1.0', sig: { ...validSignal, confidence: 1.0 }, expectedQty: 0 },
      { desc: 'signal.confidence = 1.5', sig: { ...validSignal, confidence: 1.5 }, expectedQty: 0 },
      { desc: 'signal.confidence = -0.5', sig: { ...validSignal, confidence: -0.5 }, expectedQty: 0 },
      { desc: 'signal.expectancy = NaN', sig: { ...validSignal, expectancy: NaN }, expectedQty: 0 },
      { desc: 'signal.expectancy = 0', sig: { ...validSignal, expectancy: 0 }, expectedQty: 0 },
      { desc: 'signal.expectancy = -0.05', sig: { ...validSignal, expectancy: -0.05 }, expectedQty: 0 },
      { desc: 'signal.regime = SHOCK', sig: { ...validSignal, regime: 'SHOCK' }, expectedQty: 0 },
    ];

    for (const { desc, sig, expectedQty } of signalCorruptions) {
      const res = sizeSignalToTradeSignal(sig, { portfolioEquity: 10_000, currentPrice: 50_000 });
      assert(res.quantity === expectedQty, 'sizeSignalToTradeSignal', `Returns quantity=${expectedQty} when ${desc}`);
    }

    // Drawdown breaker block
    const breaker = new TieredDrawdownBreaker(10_000);
    breaker.update(7_000); // 30% dd -> HARD_STOP
    const resBlocked = sizeSignalToTradeSignal(validSignal, {
      portfolioEquity: 10_000,
      currentPrice: 50_000,
      drawdownBreaker: breaker,
    });
    assert(resBlocked.quantity === 0, 'sizeSignalToTradeSignal', 'Returns quantity=0 when drawdownBreaker blocks trading');
  }

  // Test 2.4: AISignalPaperRouter end-to-end immunity against corruption
  {
    const executor = new PaperExecutor({ initialBalance: 10_000 });
    await executor.start(10_000, true);
    const router = new AISignalPaperRouter({ adapter, paperExecutor: executor });

    const initialBalance = router.getPnlSummary().balance;
    assert(initialBalance === 10_000, 'AISignalPaperRouter', 'Initial balance is clean $10,000');

    // Attempt routing with bad marketPrice
    const validSignal: AISignal = {
      direction: 'BUY',
      confidence: 0.80,
      expectancy: 0.05,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };

    const outNanPrice = await router.routeSignal(validSignal, NaN);
    assert(outNanPrice.status === 'REJECTED', 'AISignalPaperRouter', 'Rejects routing when marketPrice=NaN');

    const outZeroPrice = await router.routeSignal(validSignal, 0);
    assert(outZeroPrice.status === 'REJECTED', 'AISignalPaperRouter', 'Rejects routing when marketPrice=0');

    const outNegPrice = await router.routeSignal(validSignal, -50_000);
    assert(outNegPrice.status === 'REJECTED', 'AISignalPaperRouter', 'Rejects routing when marketPrice < 0');

    // Attempt routing with NaN signal
    const nanSig: AISignal = {
      direction: 'BUY',
      confidence: NaN,
      expectancy: NaN,
      regime: 'TREND_UP',
      timestamp: Date.now(),
    };
    const outNanSig = await router.routeSignal(nanSig, 50_000);
    assert(outNanSig.status === 'REJECTED', 'AISignalPaperRouter', 'Rejects routing when signal has NaN confidence/expectancy');

    // Check account state after all bad routing attempts
    const balanceAfterBadRouting = router.getPnlSummary().balance;
    const positionsAfterBadRouting = router.getPositions();
    assert(balanceAfterBadRouting === 10_000 && !isNaN(balanceAfterBadRouting),
      'AISignalPaperRouter', 'Account balance remains intact ($10,000) with zero NaN corruption');
    assert(positionsAfterBadRouting.length === 0,
      'AISignalPaperRouter', 'Zero phantom positions opened from rejected signals');

    // Attempt SELL without existing position
    const sellSig: AISignal = {
      direction: 'SELL',
      confidence: 0.80,
      expectancy: 0.05,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };
    const outSellNoPos = await router.routeSignal(sellSig, 50_000);
    assert(outSellNoPos.status === 'REJECTED', 'AISignalPaperRouter', 'Rejects SELL order when no position exists');

    await executor.stop();
  }

  // Test 2.5: PaperExecutor direct input validation
  {
    const executor = new PaperExecutor({ initialBalance: 10_000 });
    await executor.start(10_000, true);

    const res1 = await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: NaN, price: 50_000 }, 50_000);
    assert(res1.success === false, 'PaperExecutor', 'Directly rejects trade with quantity=NaN');

    const res2 = await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 1, price: NaN }, 50_000);
    assert(res2.success === false, 'PaperExecutor', 'Directly rejects trade with price=NaN');

    const res3 = await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 0, price: 50_000 }, 50_000);
    assert(res3.success === false, 'PaperExecutor', 'Directly rejects trade with quantity=0');

    const res4 = await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 1, price: 0 }, 50_000);
    assert(res4.success === false, 'PaperExecutor', 'Directly rejects trade with price=0');

    const res5 = await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: -1, price: 50_000 }, 50_000);
    assert(res5.success === false, 'PaperExecutor', 'Directly rejects trade with quantity < 0');

    await executor.stop();
  }

  // =========================================================================
  // SUITE 3: Fuzzing & High Concurrency Stress
  // =========================================================================
  console.log('\n--- SUITE 3: Fuzzing & Stress Testing ---');

  // Test 3.1: 500 Random Fuzz Iterations into Router
  {
    const executor = new PaperExecutor({ initialBalance: 50_000 });
    await executor.start(50_000, true);
    const router = new AISignalPaperRouter({ adapter, paperExecutor: executor });

    let fuzzedErrors = 0;
    const fuzzValues = [NaN, Infinity, -Infinity, null, undefined, -1, 0, 0.5, 0.75, 1.0, 1.5, 'bad' as any];
    const regimes: any[] = ['TREND_UP', 'TREND_DOWN', 'RANGE', 'SHOCK', 'UNKNOWN', 'INVALID', null, undefined];

    for (let i = 0; i < 500; i++) {
      const conf = fuzzValues[i % fuzzValues.length];
      const exp = fuzzValues[(i * 3) % fuzzValues.length];
      const reg = regimes[(i * 7) % regimes.length];
      const price = (i % 5 === 0) ? fuzzValues[i % fuzzValues.length] : 50_000 + (i % 100);

      const fuzzedSignal: AISignal = {
        direction: i % 2 === 0 ? 'BUY' : 'SELL',
        confidence: conf,
        expectancy: exp,
        regime: reg,
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
      };

      try {
        await router.routeSignal(fuzzedSignal, price);
      } catch (err) {
        fuzzedErrors++;
      }
    }

    assert(fuzzedErrors === 0, 'FuzzingStress', '500 malformed/adversarial signals fuzzed into Router with ZERO uncaught exceptions');
    const finalBalance = router.getPnlSummary().balance;
    assert(Number.isFinite(finalBalance) && finalBalance > 0, 'FuzzingStress', `Account balance remained strictly finite and positive ($${finalBalance.toFixed(2)})`);

    await executor.stop();
  }

  // Test 3.2: Concurrent Route Requests
  {
    const executor = new PaperExecutor({ initialBalance: 50_000 });
    await executor.start(50_000, true);
    const router = new AISignalPaperRouter({ adapter, paperExecutor: executor });

    const promises: Promise<any>[] = [];
    for (let i = 0; i < 50; i++) {
      const sig: AISignal = {
        direction: 'BUY',
        confidence: 0.80,
        expectancy: 0.04,
        regime: 'TREND_UP',
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
      };
      promises.push(router.routeSignal(sig, 50_000));
    }

    const outcomes = await Promise.all(promises);
    const fills = outcomes.filter((o) => o.status === 'FILLED').length;
    const finalSummary = router.getPnlSummary();

    assert(Number.isFinite(finalSummary.balance) && finalSummary.balance >= 0,
      'ConcurrencyStress', `50 concurrent routing calls executed safely with balance=$${finalSummary.balance.toFixed(2)} (never negative)`);
    assert(fills > 0, 'ConcurrencyStress', `Successfully processed concurrent fills (${fills} fills)`);

    await executor.stop();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n=== EMPIRICAL CHALLENGER VERIFICATION SUMMARY ===');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total tests: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error(`\nFAILED TESTS:`);
    for (const f of results.filter((r) => !r.passed)) {
      console.error(`- [${f.suite}] ${f.name}: ${f.details}`);
    }
    process.exit(1);
  } else {
    console.log('\nALL ADVERSARIAL STRESS CHALLENGES PASSED EMPIRICALLY!');
    process.exit(0);
  }
}

runAdversarialVerification().catch((err) => {
  console.error('Fatal harness crash:', err);
  process.exit(1);
});
