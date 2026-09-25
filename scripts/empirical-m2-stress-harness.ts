/**
 * Empirical Stress Test Harness: Milestone 2 Paper Execution Routing & Signal Adaptation
 *
 * Evaluates:
 * - AISignalPaperRouter
 * - AISignalAdapter
 * - PaperTradeFillRecord & mapExecutionToFillRecord
 * - RegimeAwareKelly & sizeSignalToTradeSignal
 *
 * Conducts adversarial stress-testing across:
 * 1. High-frequency rapid signal streaming throughput & stability
 * 2. Malformed / unexpected signal fuzzing & unhandled exception audit
 * 3. Extreme / adverse market pricing on BUY and SELL routing
 * 4. Continuous Mark-to-Market revaluation & position averaging math
 * 5. PnL tracking, High-Water Mark (HWM), and Drawdown calculation accuracy
 * 6. Slippage basis points calculation precision
 */

import { logger } from '../src/shared/utils/logger';
import { AISignalAdapter, type AISignal } from '../src/desk/strategies/ai-signal-adapter';
import { AISignalPaperRouter } from '../src/desk/strategies/ai-signal-paper-router';
import { PaperExecutor } from '../src/desk/execution/paper-executor';
import { RegimeAwareKelly, sizeSignalToTradeSignal } from '../src/desk/risk/regime-aware-kelly';
import { TieredDrawdownBreaker } from '../src/desk/risk/tiered-drawdown-breaker';
import { mapExecutionToFillRecord, type PaperTrade } from '../src/desk/execution/paper-position-types';

process.env.VITEST_POOL_ID = '1';

export interface StressTestFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';
  category: string;
  description: string;
  expected: string;
  actual: string;
  reproduced: boolean;
}

export class EmpiricalStressHarness {
  private findings: StressTestFinding[] = [];

  private recordFinding(finding: StressTestFinding): void {
    this.findings.push(finding);
    const prefix = finding.reproduced ? `[REPRODUCED ${finding.severity}]` : `[PASS]`;
    logger.info(`${prefix} ${finding.category}: ${finding.description}`);
  }

  // ==========================================================================
  // Section 1: High Frequency Signal Streaming
  // ==========================================================================
  async testHighFrequencyStreaming(streamCount = 500): Promise<void> {
    logger.info(`--- Starting High Frequency Streaming Test (${streamCount} signals) ---`);
    const adapter = new AISignalAdapter({
      confidenceThreshold: 0.70,
      minExpectancy: 0.02,
      regimeFilter: ['TREND_UP', 'RANGE'],
    });

    const executor = new PaperExecutor({
      initialBalance: 100_000,
      simulateFillRate: 1.0,
      slippagePercent: 0.001,
      feePercent: 0.001,
    });

    await executor.start(100_000, true);
    const router = new AISignalPaperRouter({
      adapter,
      paperExecutor: executor,
    });

    const startTime = Date.now();
    let fills = 0;
    let errors = 0;

    for (let i = 0; i < streamCount; i++) {
      const isBuy = i % 2 === 0;
      const signal: AISignal = {
        strategyId: 'alpha-hf-test',
        signalId: `sig-hf-${i}`,
        direction: isBuy ? 'BUY' : 'SELL',
        action: isBuy ? 'BUY' : 'SELL',
        confidence: 0.80,
        expectancy: 0.04,
        regime: 'TREND_UP',
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
      };

      try {
        const price = 50_000 + (i % 20) * 50;
        const outcome = await router.routeSignal(signal, price);
        if (outcome.status === 'FILLED') {
          fills++;
        }
      } catch (err: unknown) {
        errors++;
        logger.error(`HF Streaming threw exception at step ${i}`, undefined, err as Error);
      }
    }

    const elapsed = Date.now() - startTime;
    const fillsRecorded = router.getFillRecords().length;
    const equityCurveLen = router.getEquityCurve().length;

    await executor.stop();

    if (errors === 0 && fills === streamCount && fillsRecorded === streamCount) {
      this.recordFinding({
        severity: 'PASS',
        category: 'High Frequency Streaming',
        description: `Successfully streamed ${streamCount} signals in ${elapsed}ms (${(streamCount / (elapsed / 1000)).toFixed(1)} sig/sec) with zero errors.`,
        expected: `${streamCount} fills recorded with zero unhandled exceptions`,
        actual: `${fills} fills, ${fillsRecorded} recorded fills, ${errors} exceptions`,
        reproduced: false,
      });
    } else {
      this.recordFinding({
        severity: 'HIGH',
        category: 'High Frequency Streaming',
        description: `High frequency streaming had dropped fills or exceptions`,
        expected: `${streamCount} fills`,
        actual: `${fills} fills, ${errors} exceptions`,
        reproduced: true,
      });
    }
  }

  // ==========================================================================
  // Section 2: Malformed Signal Ingestion & Unhandled Exceptions
  // ==========================================================================
  async testMalformedSignals(): Promise<void> {
    logger.info(`--- Starting Malformed Signal & Unhandled Exception Stress Test ---`);
    const adapter = new AISignalAdapter({
      confidenceThreshold: 0.70,
      minExpectancy: 0.02,
      regimeFilter: ['TREND_UP', 'RANGE'],
    });

    const executor = new PaperExecutor({ initialBalance: 10_000 });
    await executor.start(10_000, true);
    const router = new AISignalPaperRouter({ adapter, paperExecutor: executor });

    // Test 2.1: null confidence / expectancy (Unhanded TypeError in toFixed)
    try {
      const nullSig = {
        confidence: (null as unknown) as number,
        expectancy: 0.05,
        regime: 'TREND_UP' as const,
        timestamp: Date.now(),
      };
      adapter.validateSignal(nullSig);
      this.recordFinding({
        severity: 'PASS',
        category: 'Exception Safety',
        description: 'null confidence handled gracefully without exception',
        expected: 'Handled without throwing TypeError',
        actual: 'No exception thrown',
        reproduced: false,
      });
    } catch (err: unknown) {
      this.recordFinding({
        severity: 'CRITICAL',
        category: 'Unhandled Exception',
        description: 'adapter.validateSignal crashes with TypeError on null confidence',
        expected: 'Gracefully reject invalid input with valid: false',
        actual: `Threw exception: ${(err as Error).message}`,
        reproduced: true,
      });
    }

    try {
      const nullExpSig = {
        confidence: 0.8,
        expectancy: (null as unknown) as number,
        regime: 'TREND_UP' as const,
        timestamp: Date.now(),
      };
      adapter.validateSignal(nullExpSig);
      this.recordFinding({
        severity: 'PASS',
        category: 'Exception Safety',
        description: 'null expectancy handled gracefully without exception',
        expected: 'Handled without throwing TypeError',
        actual: 'No exception thrown',
        reproduced: false,
      });
    } catch (err: unknown) {
      this.recordFinding({
        severity: 'CRITICAL',
        category: 'Unhandled Exception',
        description: 'adapter.validateSignal crashes with TypeError on null expectancy',
        expected: 'Gracefully reject invalid input with valid: false',
        actual: `Threw exception: ${(err as Error).message}`,
        reproduced: true,
      });
    }

    // Test 2.2: NaN confidence & expectancy validation bypass
    const nanSig: AISignal = {
      direction: 'BUY',
      confidence: NaN,
      expectancy: NaN,
      regime: 'TREND_UP',
      timestamp: Date.now(),
    };
    const nanValidation = adapter.validateSignal(nanSig);
    if (nanValidation.valid) {
      this.recordFinding({
        severity: 'CRITICAL',
        category: 'Validation Gate Bypass',
        description: 'adapter.validateSignal treats NaN confidence and expectancy as valid',
        expected: 'valid: false with rejectionReasons mentioning invalid confidence/expectancy',
        actual: 'valid: true with empty rejectionReasons []',
        reproduced: true,
      });
    } else {
      this.recordFinding({
        severity: 'PASS',
        category: 'Validation Gate Bypass',
        description: 'adapter.validateSignal rejects NaN values',
        expected: 'valid: false',
        actual: `valid: ${nanValidation.valid}`,
        reproduced: false,
      });
    }

    // Test 2.3: NaN propagation into Router and Portfolio state corruption
    try {
      const nanOutcome = await router.routeSignal(nanSig, 50_000);
      const postTradesPositions = router.getPositions();
      const hasNanQty = postTradesPositions.some((p) => isNaN(p.quantity));
      const hasNanBalance = isNaN(router.getPnlSummary().balance);

      if (nanOutcome.status === 'FILLED' || hasNanQty || hasNanBalance) {
        this.recordFinding({
          severity: 'CRITICAL',
          category: 'State Corruption',
          description: 'NaN signal executed as FILLED and corrupted account balance/positions with NaN',
          expected: 'Rejected before execution without modifying portfolio balance or positions',
          actual: `status: ${nanOutcome.status}, position qty: ${postTradesPositions[0]?.quantity}, balance: ${router.getPnlSummary().balance}`,
          reproduced: true,
        });
      } else {
        this.recordFinding({
          severity: 'PASS',
          category: 'State Corruption',
          description: 'NaN signal rejected before corrupting account state',
          expected: 'Rejected / zero size',
          actual: `status: ${nanOutcome.status}`,
          reproduced: false,
        });
      }
    } catch (err: unknown) {
      this.recordFinding({
        severity: 'HIGH',
        category: 'Unhandled Exception',
        description: 'router.routeSignal threw exception on NaN signal',
        expected: 'Handled gracefully',
        actual: (err as Error).message,
        reproduced: true,
      });
    }

    // Test 2.4: undefined confidence & expectancy
    const undefinedSig = {
      direction: 'BUY' as const,
      confidence: (undefined as unknown) as number,
      expectancy: (undefined as unknown) as number,
      regime: 'TREND_UP' as const,
      timestamp: Date.now(),
    };
    const undefValidation = adapter.validateSignal(undefinedSig);
    if (undefValidation.valid) {
      this.recordFinding({
        severity: 'CRITICAL',
        category: 'Validation Gate Bypass',
        description: 'adapter.validateSignal treats undefined confidence/expectancy as valid',
        expected: 'valid: false',
        actual: 'valid: true with rejectionReasons: []',
        reproduced: true,
      });
    }

    // Test 2.5: Impossible confidence (> 1 or < 0)
    const outOfBoundsSig: AISignal = {
      direction: 'BUY',
      confidence: 1.5, // Probability cannot exceed 1.0
      expectancy: 0.05,
      regime: 'TREND_UP',
      timestamp: Date.now(),
    };
    const oobValidation = adapter.validateSignal(outOfBoundsSig);
    if (oobValidation.valid) {
      this.recordFinding({
        severity: 'HIGH',
        category: 'Validation Gate',
        description: 'adapter.validateSignal accepts impossible confidence > 1.0 (1.50)',
        expected: 'valid: false (confidence must be bounded in [0, 1])',
        actual: 'valid: true',
        reproduced: true,
      });
    }

    await executor.stop();
  }

  // ==========================================================================
  // Section 3: Adverse Market Pricing on BUY and SELL Orders
  // ==========================================================================
  async testAdverseMarketPricing(): Promise<void> {
    logger.info(`--- Starting Adverse Market Pricing Test ---`);
    const adapter = new AISignalAdapter({
      confidenceThreshold: 0.70,
      minExpectancy: 0.02,
      regimeFilter: ['TREND_UP'],
    });

    const executor = new PaperExecutor({ initialBalance: 10_000 });
    await executor.start(10_000, true);
    const router = new AISignalPaperRouter({ adapter, paperExecutor: executor });

    // Open a valid long position first
    const buySig: AISignal = {
      direction: 'BUY',
      confidence: 0.80,
      expectancy: 0.04,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };
    await router.routeSignal(buySig, 50_000);
    const pos = router.getPositions()[0];

    // Test 3.1: SELL with marketPrice = NaN
    const sellSig: AISignal = {
      direction: 'SELL',
      confidence: 0.80,
      expectancy: 0.04,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };

    const nanSellOutcome = await router.routeSignal(sellSig, NaN);
    if (nanSellOutcome.status === 'FILLED') {
      this.recordFinding({
        severity: 'CRITICAL',
        category: 'Adverse Pricing',
        description: 'router.routeSignal executes SELL order when marketPrice is NaN, corrupting balance with NaN',
        expected: 'REJECTED due to invalid non-finite marketPrice',
        actual: `status: FILLED, executedPrice: ${nanSellOutcome.fillRecord?.executedPrice}, balance: ${router.getPnlSummary().balance}`,
        reproduced: true,
      });
    } else {
      this.recordFinding({
        severity: 'PASS',
        category: 'Adverse Pricing',
        description: 'router.routeSignal rejects SELL with NaN marketPrice',
        expected: 'REJECTED',
        actual: nanSellOutcome.status,
        reproduced: false,
      });
    }

    // Reset account for next check
    await router.reset(10_000);
    await router.routeSignal(buySig, 50_000);

    // Test 3.2: SELL with marketPrice = 0 or negative
    const zeroSellOutcome = await router.routeSignal(sellSig, 0);
    if (zeroSellOutcome.status === 'FILLED') {
      this.recordFinding({
        severity: 'CRITICAL',
        category: 'Adverse Pricing',
        description: 'router.routeSignal executes SELL at $0.00, wiping out position capital without price validation',
        expected: 'REJECTED due to marketPrice <= 0',
        actual: `status: FILLED, executedPrice: ${zeroSellOutcome.fillRecord?.executedPrice}, pnl: ${zeroSellOutcome.executionResult?.trade?.pnl}`,
        reproduced: true,
      });
    } else {
      this.recordFinding({
        severity: 'PASS',
        category: 'Adverse Pricing',
        description: 'router.routeSignal rejects SELL with marketPrice <= 0',
        expected: 'REJECTED',
        actual: zeroSellOutcome.status,
        reproduced: false,
      });
    }

    await executor.stop();
  }

  // ==========================================================================
  // Section 4: Mark-to-Market Continuous Equity Revaluation & Position Averaging
  // ==========================================================================
  async testPositionAveragingAndMtm(): Promise<void> {
    logger.info(`--- Starting Position Averaging & Mark-to-Market Test ---`);
    const adapter = new AISignalAdapter({
      confidenceThreshold: 0.70,
      minExpectancy: 0.02,
      regimeFilter: ['TREND_UP'],
    });

    const executor = new PaperExecutor({ initialBalance: 100_000 });
    await executor.start(100_000, true);
    const router = new AISignalPaperRouter({ adapter, paperExecutor: executor });

    // Buy 1 @ 50,000
    const buySig: AISignal = {
      direction: 'BUY',
      confidence: 0.80,
      expectancy: 0.04,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };

    await router.routeSignal(buySig, 50_000);
    const pos1 = router.getPositions()[0];
    const qty1 = pos1.quantity;
    const entry1 = pos1.entryPrice;

    // Buy 2 @ 60,000
    await router.routeSignal(buySig, 60_000);
    const pos2 = router.getPositions()[0];
    const totalQty = pos2.quantity;
    const blendedEntry = pos2.entryPrice;

    // Check theoretical weighted average
    // entry1 ~ 50,050; buy2 entry ~ 60,060
    const buy2ExecutedPrice = 60_000 * 1.001;
    const addedQty = totalQty - qty1;
    const theoreticalEntry = (qty1 * entry1 + addedQty * buy2ExecutedPrice) / totalQty;

    const diff = Math.abs(blendedEntry - theoreticalEntry);
    if (diff < 0.01) {
      this.recordFinding({
        severity: 'PASS',
        category: 'Position Averaging',
        description: `Weighted average entry price correctly calculated ($${blendedEntry.toFixed(2)}) matching theoretical ($${theoreticalEntry.toFixed(2)})`,
        expected: `entryPrice == ${theoreticalEntry.toFixed(2)}`,
        actual: `${blendedEntry.toFixed(2)}`,
        reproduced: false,
      });
    } else {
      this.recordFinding({
        severity: 'HIGH',
        category: 'Position Averaging',
        description: `Position entry price math discrepancy: actual $${blendedEntry} vs theoretical $${theoreticalEntry}`,
        expected: `${theoreticalEntry.toFixed(2)}`,
        actual: `${blendedEntry.toFixed(2)}`,
        reproduced: true,
      });
    }

    // Mark-to-market revaluation at 70,000
    router.markToMarket(new Map([['BTC/USDT', 70_000]]));
    const mtmPos = router.getPositions()[0];
    const expectedUnrealized = (70_000 - blendedEntry) * totalQty;

    if (Math.abs(mtmPos.unrealizedPnl - expectedUnrealized) < 0.01) {
      this.recordFinding({
        severity: 'PASS',
        category: 'Mark to Market Revaluation',
        description: `Unrealized PnL correctly marked to market ($${mtmPos.unrealizedPnl.toFixed(2)})`,
        expected: `${expectedUnrealized.toFixed(2)}`,
        actual: `${mtmPos.unrealizedPnl.toFixed(2)}`,
        reproduced: false,
      });
    }

    await executor.stop();
  }

  // ==========================================================================
  // Section 5: PnL Tracking, High-Water Mark & Drawdown Calculation
  // ==========================================================================
  async testEquityAndDrawdownTracking(): Promise<void> {
    logger.info(`--- Starting Equity, HWM & Drawdown Tracking Test ---`);
    const adapter = new AISignalAdapter({
      confidenceThreshold: 0.70,
      minExpectancy: 0.02,
      regimeFilter: ['TREND_UP'],
    });

    const executor = new PaperExecutor({ initialBalance: 10_000 });
    await executor.start(10_000, true);
    const router = new AISignalPaperRouter({ adapter, paperExecutor: executor });

    // Step 1: Open position @ 50,000
    const buySig: AISignal = {
      direction: 'BUY',
      confidence: 0.80,
      expectancy: 0.04,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };
    await router.routeSignal(buySig, 50_000);

    // Step 2: Close position at a steep loss @ 25,000
    const sellSig: AISignal = {
      direction: 'SELL',
      confidence: 0.80,
      expectancy: 0.04,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };
    await router.routeSignal(sellSig, 25_000);

    const postSellSummary = executor.getPnlSummary();
    const equityCurve = router.getEquityCurve();
    const latestSnapshot = equityCurve[equityCurve.length - 1];

    // When all positions are closed, equity MUST equal balance!
    const trueEquity = postSellSummary.balance;
    const reportedEquity = latestSnapshot.equity;
    const reportedDrawdown = latestSnapshot.drawdown;
    const expectedDrawdown = (10_000 - trueEquity) / 10_000;

    if (reportedEquity === 10_000 && trueEquity < 9_800) {
      this.recordFinding({
        severity: 'CRITICAL',
        category: 'Equity & Drawdown Tracking',
        description: 'Equity curve snapshot does not update equity upon trade close, reporting stale initial balance ($10,000) and 0% drawdown after realized losses',
        expected: `equity == $${trueEquity.toFixed(2)}, drawdown == ${(expectedDrawdown * 100).toFixed(2)}%`,
        actual: `equity == $${reportedEquity.toFixed(2)}, drawdown == ${(reportedDrawdown * 100).toFixed(2)}%`,
        reproduced: true,
      });
    } else {
      this.recordFinding({
        severity: 'PASS',
        category: 'Equity & Drawdown Tracking',
        description: 'Equity curve snapshot updates equity and drawdown correctly upon trade close',
        expected: `equity == $${trueEquity.toFixed(2)}`,
        actual: `equity == $${reportedEquity.toFixed(2)}`,
        reproduced: false,
      });
    }

    await executor.stop();
  }

  // ==========================================================================
  // Section 6: Slippage Basis Points Precision
  // ==========================================================================
  async testSlippageBpsPrecision(): Promise<void> {
    logger.info(`--- Starting Slippage Basis Points Precision Test ---`);

    const testCases: Array<{ req: number; exec: number; expectedBps: number }> = [
      { req: 50_000, exec: 50_050, expectedBps: 10 },
      { req: 50_000, exec: 49_950, expectedBps: 10 },
      { req: 100, exec: 100.0125, expectedBps: 1 }, // 1.25 -> round 1
      { req: 100, exec: 100.0175, expectedBps: 2 }, // 1.75 -> round 2
      { req: 100, exec: 100.0000, expectedBps: 0 },
      { req: 0, exec: 50_000, expectedBps: 0 },     // Zero guard
      { req: -100, exec: 100, expectedBps: 0 },     // Negative guard
    ];

    let allPassed = true;
    for (const tc of testCases) {
      const mockTrade: PaperTrade = {
        id: 'test-trade',
        symbol: 'BTC/USDT',
        side: 'buy',
        quantity: 1,
        requestedPrice: tc.req,
        executedPrice: tc.exec,
        fee: 0,
        slippage: tc.exec - tc.req,
        status: 'filled',
        timestamp: Date.now(),
      };

      const fill = mapExecutionToFillRecord(mockTrade, 'alpha-test');
      if (fill.slippageBps !== tc.expectedBps) {
        allPassed = false;
        this.recordFinding({
          severity: 'HIGH',
          category: 'Slippage Calculation',
          description: `Slippage bps mismatch for req=${tc.req}, exec=${tc.exec}`,
          expected: `${tc.expectedBps} bps`,
          actual: `${fill.slippageBps} bps`,
          reproduced: true,
        });
      }
    }

    if (allPassed) {
      this.recordFinding({
        severity: 'PASS',
        category: 'Slippage Calculation',
        description: 'All 7 slippage basis points precision test cases passed exact mathematical formula round(abs(Pexec - Preq) / Preq * 10000)',
        expected: '100% exact matches across all boundary conditions',
        actual: '100% matches',
        reproduced: false,
      });
    }
  }

  // ==========================================================================
  // Section 7: Runner and Summary
  // ==========================================================================
  async runAll(): Promise<StressTestFinding[]> {
    await this.testHighFrequencyStreaming(500);
    await this.testMalformedSignals();
    await this.testAdverseMarketPricing();
    await this.testPositionAveragingAndMtm();
    await this.testEquityAndDrawdownTracking();
    await this.testSlippageBpsPrecision();

    return this.findings;
  }
}

// Direct execution
async function main() {
  const harness = new EmpiricalStressHarness();
  const findings = await harness.runAll();

  const criticals = findings.filter((f) => f.severity === 'CRITICAL' && f.reproduced);
  const highs = findings.filter((f) => f.severity === 'HIGH' && f.reproduced);
  const passes = findings.filter((f) => f.severity === 'PASS');

  logger.info('================================================================');
  logger.info(`STRESS HARNESS COMPLETE: ${passes.length} PASS, ${criticals.length} CRITICAL, ${highs.length} HIGH`);
  logger.info('================================================================');
}

if (import.meta.main) {
  main().catch((err) => {
    logger.error('EmpiricalStressHarness execution failed', undefined, err as Error);
    process.exit(1);
  });
}
