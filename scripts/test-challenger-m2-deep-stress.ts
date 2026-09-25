/**
 * Empirical Challenger Deep Stress Test Harness
 * Author: teamwork_preview_challenger_m2_it2_2
 *
 * Focus:
 * 1. SELL order execution with bad market prices (NaN, 0, negative, Infinity, null, undefined, types)
 * 2. Defense-in-depth at PaperExecutor for price and quantity validation
 * 3. Continuous equity & drawdown tracking across complex buy/sell lifecycles (realized P&L, HWM, Drawdown)
 * 4. Post-loss sizing accuracy (sizing must use depreciated equity, not initial balance)
 * 5. Stress loop with randomized profit/loss trajectories to verify mathematical invariants
 */

import { logger } from '../src/shared/utils/logger';
import { AISignalAdapter, type AISignal } from '../src/desk/strategies/ai-signal-adapter';
import { AISignalPaperRouter } from '../src/desk/strategies/ai-signal-paper-router';
import { PaperExecutor } from '../src/desk/execution/paper-executor';
import { RegimeAwareKelly } from '../src/desk/risk/regime-aware-kelly';

process.env.VITEST_POOL_ID = 'challenger-test-1';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details: string) {
  if (condition) {
    results.push({ name, passed: true, details });
    logger.info(`[PASS] ${name}: ${details}`);
  } else {
    results.push({ name, passed: false, details });
    logger.error(`[FAIL] ${name}: ${details}`);
  }
}

async function runChallengerTests() {
  logger.info('=== STARTING EMPIRICAL CHALLENGER DEEP STRESS TESTS ===');

  const adapter = new AISignalAdapter({
    confidenceThreshold: 0.70,
    minExpectancy: 0.02,
    regimeFilter: ['TREND_UP', 'RANGE'],
  });

  const regimeKelly = new RegimeAwareKelly({
    kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05 },
    regimeMultipliers: { TREND_UP: 1.25 },
  });

  // =========================================================================
  // TASK 3: Comprehensive Bad Market Price Matrix for SELL Orders
  // =========================================================================
  logger.info('\n--- SECTION 1: SELL Bad Market Price Matrix ---');

  const executor1 = new PaperExecutor({
    initialBalance: 10_000,
    simulateFillRate: 1.0,
    slippagePercent: 0.001,
    feePercent: 0.001,
  });
  await executor1.start(10_000, true);

  const router1 = new AISignalPaperRouter({
    adapter,
    regimeKelly,
    paperExecutor: executor1,
  });

  const validBuySignal: AISignal = {
    strategyId: 'test-strat',
    signalId: 'sig-buy-001',
    direction: 'BUY',
    action: 'BUY',
    confidence: 0.85,
    expectancy: 0.05,
    regime: 'TREND_UP',
    symbol: 'BTC/USDT',
    timestamp: Date.now(),
  };

  const buyRes = await router1.routeSignal(validBuySignal, 50_000);
  assert(buyRes.status === 'FILLED', 'Buy Pre-requisite', `Position opened with status ${buyRes.status}`);

  const positionsBeforeSell = router1.getPositions();
  const balanceBeforeSell = router1.getPnlSummary().balance;
  assert(positionsBeforeSell.length === 1, 'Initial Position Exists', `Positions count = ${positionsBeforeSell.length}`);

  const validSellSignal: AISignal = {
    strategyId: 'test-strat',
    signalId: 'sig-sell-001',
    direction: 'SELL',
    action: 'SELL',
    confidence: 0.85,
    expectancy: 0.05,
    regime: 'TREND_UP',
    symbol: 'BTC/USDT',
    timestamp: Date.now(),
  };

  const badPrices: Array<{ desc: string; val: unknown }> = [
    { desc: 'NaN', val: NaN },
    { desc: '0', val: 0 },
    { desc: '-1', val: -1 },
    { desc: '-50000', val: -50_000 },
    { desc: 'negative tiny (-0.00001)', val: -0.00001 },
    { desc: 'positive Infinity', val: Infinity },
    { desc: 'negative Infinity', val: -Infinity },
    { desc: 'undefined', val: undefined },
    { desc: 'null', val: null },
    { desc: 'string number "50000"', val: '50000' },
    { desc: 'empty object {}', val: {} },
    { desc: 'boolean false', val: false },
  ];

  for (const bp of badPrices) {
    const outcome = await router1.routeSignal(validSellSignal, bp.val as number);

    const isRejected = outcome.status === 'REJECTED';
    const balanceUnchanged = router1.getPnlSummary().balance === balanceBeforeSell;
    const positionUnchanged = router1.getPositions().length === 1 &&
      router1.getPositions()[0].quantity === positionsBeforeSell[0].quantity;
    const hasDiagnosticReason = typeof outcome.reason === 'string' && outcome.reason.length > 0;

    assert(
      isRejected && balanceUnchanged && positionUnchanged && hasDiagnosticReason,
      `SELL Rejected for price ${bp.desc}`,
      `status=${outcome.status}, reason="${outcome.reason}", balance=${router1.getPnlSummary().balance}`
    );
  }

  // =========================================================================
  // TASK 3.2: Direct PaperExecutor Price & Quantity Guards (Defense-in-depth)
  // =========================================================================
  logger.info('\n--- SECTION 2: Direct PaperExecutor Price & Quantity Guards ---');

  const executorBadPriceResults = [
    await executor1.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.001, price: NaN }, NaN),
    await executor1.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.001, price: 0 }, 0),
    await executor1.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.001, price: -100 }, -100),
    await executor1.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.001, price: Infinity }, Infinity),
    await executor1.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: NaN, price: 50_000 }, 50_000),
    await executor1.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0, price: 50_000 }, 50_000),
    await executor1.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: -1, price: 50_000 }, 50_000),
    await executor1.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: Infinity, price: 50_000 }, 50_000),
  ];

  for (let i = 0; i < executorBadPriceResults.length; i++) {
    const r = executorBadPriceResults[i];
    assert(
      r.success === false && typeof r.message === 'string',
      `PaperExecutor Guard [Case ${i + 1}]`,
      `success=${r.success}, message="${r.message}"`
    );
  }

  await executor1.stop();

  // =========================================================================
  // TASK 4: Continuous Equity & Drawdown Tracking Across Buy/Sell Lifecycles
  // =========================================================================
  logger.info('\n--- SECTION 3: Continuous Equity & Drawdown Tracking ---');

  const executor2 = new PaperExecutor({
    initialBalance: 10_000,
    simulateFillRate: 1.0,
    slippagePercent: 0.001,
    feePercent: 0.001,
  });
  await executor2.start(10_000, true);

  const router2 = new AISignalPaperRouter({
    adapter,
    regimeKelly,
    paperExecutor: executor2,
  });

  const eq0 = router2.getEquityCurve();
  assert(
    eq0.length >= 1 && eq0[0].equity === 10_000 && eq0[0].drawdown === 0,
    'Initial Equity Snapshot',
    `Initial snapshots count=${eq0.length}, equity=${eq0[0].equity}, dd=${eq0[0].drawdown}`
  );

  // Cycle 1: Buy @ 50,000, then Sell for PROFIT @ 60,000 (+20%)
  const buyCycle1 = await router2.routeSignal(validBuySignal, 50_000);
  assert(buyCycle1.status === 'FILLED', 'Cycle 1 BUY', `Filled @ ${buyCycle1.fillRecord?.executedPrice}`);

  const postBuyPos = router2.getPositions()[0];
  const postBuySummary = router2.getPnlSummary();
  const buyEqSnapshot = router2.getEquityCurve().slice(-1)[0];

  // Spot check: equity should equal cash balance + position value
  const expectedBuyEquity = postBuySummary.balance + postBuyPos.quantity * postBuyPos.currentPrice;
  assert(
    Math.abs(buyEqSnapshot.equity - expectedBuyEquity) < 0.01,
    'Post-Buy Equity Exact Formula',
    `snapshot equity=${buyEqSnapshot.equity.toFixed(2)}, expected=${expectedBuyEquity.toFixed(2)}`
  );

  // MTM revaluation at 65,000 before sell
  router2.markToMarket(new Map([['BTC/USDT', 65_000]]));
  const mtmSnapshot = router2.getEquityCurve().slice(-1)[0];
  assert(
    mtmSnapshot.equity > 10_000 && mtmSnapshot.highWaterMark === mtmSnapshot.equity && mtmSnapshot.drawdown === 0,
    'MTM Peak HWM Update',
    `equity=${mtmSnapshot.equity.toFixed(2)}, HWM=${mtmSnapshot.highWaterMark.toFixed(2)}, DD=${mtmSnapshot.drawdown}`
  );
  const peakHwm = mtmSnapshot.highWaterMark;

  // Now Sell @ 60,000
  const sellCycle1 = await router2.routeSignal(validSellSignal, 60_000);
  assert(sellCycle1.status === 'FILLED', 'Cycle 1 SELL', `Filled @ ${sellCycle1.fillRecord?.executedPrice}`);

  const postSellPositions = router2.getPositions();
  const postSellSummary = router2.getPnlSummary();
  const sellEqSnapshot = router2.getEquityCurve().slice(-1)[0];

  // When positions closed: positions must be 0, equity MUST EQUAL cash balance exactly!
  assert(
    postSellPositions.length === 0,
    'Cycle 1 Positions Fully Closed',
    `Open positions = ${postSellPositions.length}`
  );
  assert(
    Math.abs(sellEqSnapshot.equity - postSellSummary.balance) < 0.001,
    'Cycle 1 Equity Equals Cash Balance On Close',
    `equity=${sellEqSnapshot.equity.toFixed(2)}, balance=${postSellSummary.balance.toFixed(2)}`
  );
  assert(
    postSellSummary.totalPnl > 0,
    'Cycle 1 Realized Profit Positive',
    `realized P&L = +$${postSellSummary.totalPnl.toFixed(2)}`
  );
  // High-water mark remains peak, drawdown is positive because 60k is below peak 65k MTM
  assert(
    sellEqSnapshot.highWaterMark === peakHwm,
    'Cycle 1 HWM Preserved',
    `HWM=${sellEqSnapshot.highWaterMark.toFixed(2)} vs peak=${peakHwm.toFixed(2)}`
  );
  const expectedSellDd = (peakHwm - sellEqSnapshot.equity) / peakHwm;
  assert(
    Math.abs(sellEqSnapshot.drawdown - expectedSellDd) < 0.0001,
    'Cycle 1 Drawdown Math Verification',
    `drawdown=${sellEqSnapshot.drawdown.toFixed(6)}, expected=${expectedSellDd.toFixed(6)}`
  );

  // Cycle 2: Buy @ 60,000, then Sell for CATASTROPHIC LOSS @ 30,000 (-50%)
  const buyCycle2 = await router2.routeSignal(validBuySignal, 60_000);
  assert(buyCycle2.status === 'FILLED', 'Cycle 2 BUY', `Filled @ ${buyCycle2.fillRecord?.executedPrice}`);

  const sellLossCycle2 = await router2.routeSignal(validSellSignal, 30_000);
  assert(sellLossCycle2.status === 'FILLED', 'Cycle 2 SELL (Loss)', `Filled @ ${sellLossCycle2.fillRecord?.executedPrice}`);

  const postLossPositions = router2.getPositions();
  const postLossSummary = router2.getPnlSummary();
  const lossEqSnapshot = router2.getEquityCurve().slice(-1)[0];

  assert(
    postLossPositions.length === 0,
    'Cycle 2 Positions Fully Closed',
    `Open positions = ${postLossPositions.length}`
  );
  assert(
    Math.abs(lossEqSnapshot.equity - postLossSummary.balance) < 0.001,
    'Cycle 2 Equity Equals Cash Balance On Loss Close',
    `equity=${lossEqSnapshot.equity.toFixed(2)}, balance=${postLossSummary.balance.toFixed(2)}`
  );
  assert(
    lossEqSnapshot.drawdown > 0.01,
    'Cycle 2 Drawdown Significantly Increased',
    `drawdown=${(lossEqSnapshot.drawdown * 100).toFixed(2)}%, maxDD=${(lossEqSnapshot.maxDrawdown * 100).toFixed(2)}%`
  );
  assert(
    lossEqSnapshot.equity !== 10_000,
    'Cycle 2 Equity Not Stale',
    `equity=${lossEqSnapshot.equity.toFixed(2)} (MUST NOT BE 10000)`
  );

  // Cycle 3: Verify Position Sizing uses depreciated equity
  const buyCycle3 = await router2.routeSignal(validBuySignal, 50_000);
  assert(buyCycle3.status === 'FILLED', 'Cycle 3 BUY', `Filled`);
  const cycle3TradeQty = buyCycle3.tradeSignal!.quantity;
  const cycle3AllocatedUsd = cycle3TradeQty * 50_000;
  // Sizing should be based on depreciated equity (< $10,400), not starting $10,000 or peak
  const depreciatedEquity = postLossSummary.balance;
  const expectedMaxCap = depreciatedEquity * 0.05 * 1.25; // max 5% with 1.25 multiplier
  assert(
    cycle3AllocatedUsd <= expectedMaxCap + 0.1,
    'Cycle 3 Position Sizing Uses Depreciated Equity',
    `Allocated $${cycle3AllocatedUsd.toFixed(2)} <= Max Cap $${expectedMaxCap.toFixed(2)}`
  );

  await executor2.stop();

  // =========================================================================
  // TASK 4.2: 50-Step Randomized Stress Trajectory Invariant Check
  // =========================================================================
  logger.info('\n--- SECTION 4: 50-Step Stress Trajectory Invariant Check ---');

  const executor3 = new PaperExecutor({
    initialBalance: 50_000,
    simulateFillRate: 1.0,
    slippagePercent: 0.001,
    feePercent: 0.001,
  });
  await executor3.start(50_000, true);

  const router3 = new AISignalPaperRouter({
    adapter,
    regimeKelly,
    paperExecutor: executor3,
  });

  let invariantFailures = 0;
  let simulatedPrice = 50_000;

  for (let step = 0; step < 50; step++) {
    const isBuy = step % 2 === 0;
    // Price moves between -5% and +5%
    const priceChangePct = (Math.sin(step) * 0.05);
    simulatedPrice = Math.max(100, simulatedPrice * (1 + priceChangePct));

    const sig: AISignal = {
      strategyId: 'random-stress',
      signalId: `sig-rand-${step}`,
      direction: isBuy ? 'BUY' : 'SELL',
      action: isBuy ? 'BUY' : 'SELL',
      confidence: 0.80,
      expectancy: 0.03,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };

    const outcome = await router3.routeSignal(sig, simulatedPrice);
    if (outcome.status === 'FILLED') {
      const summary = router3.getPnlSummary();
      const positions = router3.getPositions();
      const latestPoint = router3.getEquityCurve().slice(-1)[0];

      // INVARIANT 1: Equity must be finite and positive
      if (!Number.isFinite(latestPoint.equity) || latestPoint.equity <= 0) {
        invariantFailures++;
        logger.error(`Invariant 1 Failure at step ${step}: equity=${latestPoint.equity}`);
      }

      // INVARIANT 2: HWM must be >= equity
      if (latestPoint.highWaterMark < latestPoint.equity - 0.001) {
        invariantFailures++;
        logger.error(`Invariant 2 Failure at step ${step}: HWM=${latestPoint.highWaterMark} < equity=${latestPoint.equity}`);
      }

      // INVARIANT 3: Drawdown must be in [0, 1]
      if (latestPoint.drawdown < -0.0001 || latestPoint.drawdown > 1.0) {
        invariantFailures++;
        logger.error(`Invariant 3 Failure at step ${step}: drawdown=${latestPoint.drawdown}`);
      }

      // INVARIANT 4: If positions == 0, equity must equal balance
      if (positions.length === 0) {
        if (Math.abs(latestPoint.equity - summary.balance) > 0.01) {
          invariantFailures++;
          logger.error(`Invariant 4 Failure at step ${step}: equity=${latestPoint.equity} != balance=${summary.balance}`);
        }
      }
    }
  }

  await executor3.stop();

  assert(
    invariantFailures === 0,
    '50-Step Stress Trajectory Invariants',
    `All invariants held across all steps (${invariantFailures} failures)`
  );

  // =========================================================================
  // TASK 4.3: Partial Sell & Multi-Symbol Portfolio Equity Tracking
  // =========================================================================
  logger.info('\n--- SECTION 5: Multi-Symbol Portfolio & Partial Sell ---');

  const executor4 = new PaperExecutor({
    initialBalance: 20_000,
    simulateFillRate: 1.0,
    slippagePercent: 0.001,
    feePercent: 0.001,
  });
  await executor4.start(20_000, true);

  const router4 = new AISignalPaperRouter({
    adapter,
    regimeKelly,
    paperExecutor: executor4,
  });

  // Buy BTC
  const buyBtcSig: AISignal = {
    strategyId: 'multi-asset',
    signalId: 'sig-btc-01',
    direction: 'BUY',
    confidence: 0.85,
    expectancy: 0.05,
    regime: 'TREND_UP',
    symbol: 'BTC/USDT',
    timestamp: Date.now(),
  };
  await router4.routeSignal(buyBtcSig, 50_000);

  // Buy ETH
  const buyEthSig: AISignal = {
    strategyId: 'multi-asset',
    signalId: 'sig-eth-01',
    direction: 'BUY',
    confidence: 0.85,
    expectancy: 0.05,
    regime: 'TREND_UP',
    symbol: 'ETH/USDT',
    timestamp: Date.now(),
  };
  await router4.routeSignal(buyEthSig, 3_000);

  const multiPositions = router4.getPositions();
  assert(multiPositions.length === 2, 'Multi-Asset Positions Count', `Count = ${multiPositions.length}`);

  const btcPos = multiPositions.find((p) => p.symbol === 'BTC/USDT')!;
  const ethPos = multiPositions.find((p) => p.symbol === 'ETH/USDT')!;
  assert(btcPos && ethPos, 'Both BTC and ETH Positions Exist', 'BTC and ETH confirmed');

  // Sell BTC only
  const sellBtcSig: AISignal = {
    strategyId: 'multi-asset',
    signalId: 'sig-btc-sell',
    direction: 'SELL',
    confidence: 0.85,
    expectancy: 0.05,
    regime: 'TREND_UP',
    symbol: 'BTC/USDT',
    timestamp: Date.now(),
  };
  await router4.routeSignal(sellBtcSig, 55_000);

  const postBtcSellPositions = router4.getPositions();
  assert(
    postBtcSellPositions.length === 1 && postBtcSellPositions[0].symbol === 'ETH/USDT',
    'BTC Closed, ETH Remains Open',
    `Remaining: ${postBtcSellPositions.map((p) => p.symbol).join(', ')}`
  );

  const latestMultiPoint = router4.getEquityCurve().slice(-1)[0];
  const postBtcSellSummary = router4.getPnlSummary();
  const remainingEthValue = postBtcSellPositions[0].quantity * postBtcSellPositions[0].currentPrice;
  const expectedMultiEquity = postBtcSellSummary.balance + remainingEthValue;

  assert(
    Math.abs(latestMultiPoint.equity - expectedMultiEquity) < 0.01,
    'Multi-Asset Equity Accurately Accounts For Remaining Position',
    `Equity=${latestMultiPoint.equity.toFixed(2)}, expected=${expectedMultiEquity.toFixed(2)}`
  );

  // Partial Sell directly via PaperExecutor
  const ethQuantityToSell = postBtcSellPositions[0].quantity / 2;
  const partialSellResult = await executor4.executePaperTrade(
    { symbol: 'ETH/USDT', side: 'sell', quantity: ethQuantityToSell, price: 3_200 },
    3_200
  );
  assert(partialSellResult.success, 'Partial Sell Execution', `success=${partialSellResult.success}`);

  const postPartialPositions = executor4.getPositions();
  assert(
    postPartialPositions.length === 1 &&
    Math.abs(postPartialPositions[0].quantity - ethQuantityToSell) < 0.0001,
    'Partial Sell Retains Remainder Position',
    `Remaining qty=${postPartialPositions[0]?.quantity.toFixed(6)}, expected=${ethQuantityToSell.toFixed(6)}`
  );

  const executorSummary = executor4.getPnlSummary();
  const partialEthValue = postPartialPositions[0].quantity * postPartialPositions[0].currentPrice;
  const expectedPartialEquity = executorSummary.balance + partialEthValue;
  assert(
    Math.abs(executorSummary.equity - expectedPartialEquity) < 0.01,
    'Partial Sell Equity Accurately Synchronized in PaperExecutor',
    `executor equity=${executorSummary.equity.toFixed(2)}, expected=${expectedPartialEquity.toFixed(2)}`
  );

  // Test Router Reset
  await router4.reset(30_000);
  assert(
    router4.getPositions().length === 0 &&
    router4.getFillRecords().length === 0 &&
    router4.getPnlSummary().balance === 30_000 &&
    router4.getPnlSummary().equity === 30_000 &&
    router4.getEquityCurve().length === 1 &&
    router4.getEquityCurve()[0].equity === 30_000 &&
    router4.getEquityCurve()[0].highWaterMark === 30_000 &&
    router4.getEquityCurve()[0].drawdown === 0,
    'Router Reset Full State Cleanse',
    'Reset successfully cleared all records and reset HWM to new initial balance'
  );

  await executor4.stop();

  // =========================================================================
  // SUMMARY
  // =========================================================================
  const failed = results.filter((r) => !r.passed);
  const passed = results.filter((r) => r.passed);

  logger.info('\n================================================================');
  logger.info(`CHALLENGER STRESS COMPLETE: ${passed.length} PASS, ${failed.length} FAIL`);
  logger.info('================================================================');

  if (failed.length > 0) {
    logger.error(`Failed tests:\n${failed.map((f) => `- ${f.name}: ${f.details}`).join('\n')}`);
    process.exit(1);
  }
}

runChallengerTests().catch((err) => {
  logger.error('Fatal error during challenger test execution', undefined, err as Error);
  process.exit(1);
});
