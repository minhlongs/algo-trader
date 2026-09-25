/**
 * Alpha-Lab Autonomous Pipeline Orchestrator Unit Tests
 *
 * Verifies all 7 lifecycle areas and subsystem integration:
 * Group 1: Initialization & Lifecycle Management
 * Group 2: Discovery & Walkforward Evaluation Integration
 * Group 3: Candidate Ingestion & Signal Adapter Validation
 * Group 4: Position Sizing & Paper Execution Routing
 * Group 5: Statistical Promotion Gates & Retirement
 * Group 6: Live Pre-Trade Risk Verification Handoff
 * Group 7: Provenance Ledger Integrity & Autonomous Cycle
 */

process.env.VITEST_POOL_ID = '1';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import {
  AlphaLabAutonomousPipeline,
  type AlphaLabAutonomousPipelineConfig,
} from '../../../../src/alpha-lab/pipeline';
import {
  ContinuousDiscoveryPipeline,
  type DiscoveredAlphaCandidate,
} from '../../../../src/alpha-lab/alpha-discovery';
import {
  AISignalAdapter,
  candidateToAISignal,
  type AISignal,
} from '../../../../src/desk/strategies/ai-signal-adapter';
import { AISignalPaperRouter } from '../../../../src/desk/strategies/ai-signal-paper-router';
import { PaperExecutor } from '../../../../src/desk/execution/paper-executor';
import { RegimeAwareKelly } from '../../../../src/desk/risk/regime-aware-kelly';
import { TieredDrawdownBreaker } from '../../../../src/desk/risk/tiered-drawdown-breaker';
import { LiveGuardHandoffCoordinator } from '../../../../src/desk/execution/live-guard-handoff';
import { LiveExecutionGuard } from '../../../../src/desk/execution/live-execution-guard-core';
import {
  readLedgerRecords,
  verifyLedgerChain,
  appendLedgerRecord,
  type LedgerRecord,
} from '../../../../src/alpha-lab/provenance/research-ledger';
import type { PolymarketOrder } from '../../../../src/desk/execution/polymarket-signer';
import {
  makeTrendUpCandles,
  makeMultiRegimeCandles,
} from '../../../e2e/alpha-lab/fixtures/market-data-fixtures';
import {
  createTempDir,
  makeGateEvaluatorInput,
} from '../../../e2e/alpha-lab/fixtures/test-helpers';

describe('AlphaLabAutonomousPipeline Unit Tests', () => {
  let tempDirObj: { path: string; cleanup: () => Promise<void> };
  let ledgerPath: string;
  let runCardDir: string;

  beforeEach(async () => {
    tempDirObj = await createTempDir('alpha-pipeline-test-');
    ledgerPath = join(tempDirObj.path, 'research-ledger.jsonl');
    runCardDir = join(tempDirObj.path, 'run-cards');
  });

  afterEach(async () => {
    await tempDirObj.cleanup();
  });

  function createPipeline(
    overrides: Partial<AlphaLabAutonomousPipelineConfig> = {},
  ): AlphaLabAutonomousPipeline {
    return new AlphaLabAutonomousPipeline({
      symbol: 'BTC/USDT',
      timeframe: '1h',
      initialBalanceUsd: 50_000,
      liveCapitalUsdc: 100_000,
      ledgerPath,
      runCardDir,
      strictLedgerVerification: true,
      ...overrides,
    });
  }

  function createDummyCandidate(
    strategyId = 'strat-test-01',
    familyId = 'momentum-breakout',
    passed = true,
  ): DiscoveredAlphaCandidate {
    return {
      strategyId,
      familyId,
      params: { lookback: 20 },
      config: {
        familyId,
        symbol: 'BTC/USDT',
        timeframe: '1h',
        strategyParams: { lookback: 20 },
        cost: { feeBps: 10, slippageBps: 10 },
      },
      walkforwardSummary: {
        totalSteps: 3,
        totalTestTrades: 45,
        testWinRate: 0.85,
        testSharpe: 1.85,
        testProfitFactor: 1.75,
        testMaxDrawdown: 0.08,
        testTotalPnl: 3500,
        consistencyScore: 0.85,
        regimeConsistencyScore: 0.80,
        overfitGap: 0.05,
      },
      survivalGateResult: {
        passed,
        evaluatedAt: new Date().toISOString(),
        sharpeRatio: 1.85,
        maxDrawdown: 0.08,
        regimeConsistencyScore: 0.80,
        costStressPassed: true,
        conservativePnl: 3000,
        adversePnl: 2200,
        metrics: {
          oosSharpeRatio: 1.85,
          maxDrawdown: 0.08,
          regimeConsistencyScore: 0.80,
          splitConsistencyScore: 0.85,
          conservativeStressPnl: 3000,
          adverseStressPnl: 2200,
          conservativeStressSharpe: 1.6,
          adverseStressSharpe: 1.3,
          testWinRate: 0.85,
          testProfitFactor: 1.75,
          totalTestTrades: 45,
        },
        checks: {
          sharpePassed: passed,
          drawdownPassed: true,
          regimeConsistencyPassed: true,
          costStressConservativePassed: true,
          costStressAdversePassed: true,
        },
        gateChecks: {
          sharpePassed: passed,
          drawdownPassed: true,
          regimeConsistencyPassed: true,
          costStressPassed: true,
        },
        thresholds: {
          minOosSharpeRatio: 1.0,
          maxDrawdown: 0.15,
          minRegimeConsistencyScore: 0.5,
          conservativeFrictionBps: 20,
          adverseFrictionBps: 50,
          minTestTrades: 5,
        },
        failures: passed ? [] : ['Sharpe ratio below threshold'],
        rejectionReasons: passed ? [] : ['Sharpe 0.80 < 1.00'],
      },
      status: passed ? 'PASSED' : 'REJECTED',
      rejectionDiagnostics: passed
        ? undefined
        : [
            {
              metric: 'sharpeRatio',
              value: 0.8,
              threshold: 1.0,
              reason: 'Sharpe ratio 0.80 below hurdle 1.00',
              refinementHypothesis: 'Tighten entry filters',
            },
          ],
    };
  }

  // ============================================================================
  // Group 1: Initialization & Lifecycle Management (4 tests)
  // ============================================================================
  describe('Group 1: Initialization & Lifecycle Management', () => {
    it('initializes with default configuration values', async () => {
      const pipeline = createPipeline();
      const status = await pipeline.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.cycleCount).toBe(0);
      expect(status.lastCycleAt).toBeNull();
      expect(status.totalStrategiesCount).toBe(0);
      expect(status.isLedgerChainValid).toBe(true);
      expect(pipeline.getTrackedStrategyIds()).toHaveLength(0);
    });

    it('accepts injected components (router, coordinator, adapter, discovery)', () => {
      const adapter = new AISignalAdapter({ confidenceThreshold: 0.85, minExpectancy: 0.05 });
      const discovery = new ContinuousDiscoveryPipeline({ symbol: 'ETH/USDT' });
      const executor = new PaperExecutor({ initialBalance: 25_000 });
      const liveGuard = new LiveExecutionGuard({ capitalUsdc: 200_000 });
      const coordinator = new LiveGuardHandoffCoordinator({
        guard: liveGuard,
        capitalUsdc: 200_000,
      });

      const pipeline = createPipeline({
        signalAdapter: adapter,
        discoveryPipeline: discovery,
        paperExecutor: executor,
        liveCoordinator: coordinator,
      });

      expect(pipeline.getSignalAdapter()).toBe(adapter);
      expect(pipeline.getDiscoveryPipeline()).toBe(discovery);
      expect(pipeline.getLiveCoordinator()).toBe(coordinator);
    });

    it('starts underlying paper executor and sets isRunning to true', async () => {
      const pipeline = createPipeline();
      await pipeline.start(60_000, true);

      const status = await pipeline.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.equity).toBeGreaterThanOrEqual(50_000);
    });

    it('stops and resets state cleanly', async () => {
      const pipeline = createPipeline();
      await pipeline.start();
      expect((await pipeline.getStatus()).isRunning).toBe(true);

      await pipeline.stop();
      expect((await pipeline.getStatus()).isRunning).toBe(false);

      const cand = createDummyCandidate('strat-reset-1');
      pipeline.ingestCandidateToPaper(cand);
      expect(pipeline.getTrackedStrategyIds()).toHaveLength(1);

      await pipeline.reset();
      const postResetStatus = await pipeline.getStatus();
      expect(postResetStatus.isRunning).toBe(false);
      expect(postResetStatus.totalStrategiesCount).toBe(0);
      expect(pipeline.getTrackedStrategyIds()).toHaveLength(0);
    });
  });

  // ============================================================================
  // Group 2: Discovery & Walkforward Evaluation Integration (4 tests)
  // ============================================================================
  describe('Group 2: Discovery & Walkforward Evaluation Integration', () => {
    it('runs candidate discovery sweep and initializes state machines in DISCOVERED', async () => {
      const candles = makeTrendUpCandles(120);
      const pipeline = createPipeline({
        discoveryConfig: {
          candles,
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      const result = await pipeline.discoverAndEvaluate(candles);
      expect(result.allCandidates.length).toBeGreaterThan(0);

      const tracked = pipeline.getTrackedStrategyIds();
      expect(tracked.length).toBe(result.allCandidates.length);

      for (const id of tracked) {
        const sm = pipeline.getLifecycleStateMachine(id);
        expect(sm).toBeDefined();
        expect(sm?.getState()).toBe('DISCOVERED');
      }
    });

    it('persists run cards and config hashes for all discovered candidates', async () => {
      const candles = makeTrendUpCandles(120);
      const pipeline = createPipeline({
        discoveryConfig: {
          candles,
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      const result = await pipeline.discoverAndEvaluate(candles);
      const firstCandidate = result.allCandidates[0]!;

      const cardPath = join(runCardDir, firstCandidate.strategyId, 'run_card.json');
      const cardContent = await readFile(cardPath, 'utf8');
      const parsed = JSON.parse(cardContent);

      expect(parsed.schemaVersion).toBe('1.0.0');
      expect(parsed.runId).toBe(firstCandidate.strategyId);
      expect(parsed.configHash).toMatch(/^[0-9a-f]{64}$/);

      const mdPath = join(runCardDir, firstCandidate.strategyId, 'run_card.md');
      const mdContent = await readFile(mdPath, 'utf8');
      expect(mdContent).toContain(firstCandidate.strategyId);
    });

    it('appends discovery records to the research ledger with valid prevHash', async () => {
      const candles = makeTrendUpCandles(120);
      const pipeline = createPipeline({
        discoveryConfig: {
          candles,
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      await pipeline.discoverAndEvaluate(candles);
      const records = await readLedgerRecords(ledgerPath);

      expect(records.length).toBeGreaterThan(0);
      expect(records[0]?.prevHash).toBe('');
      if (records.length > 1) {
        expect(records[1]?.prevHash).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(verifyLedgerChain(records)).toBe(-1);
    });

    it('handles zero passing candidates gracefully without error (B16.1)', async () => {
      // Configure impossibly high survival hurdle so 0 candidates pass
      const candles = makeTrendUpCandles(120);
      const pipeline = createPipeline({
        discoveryConfig: {
          candles,
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
          survivalGates: {
            minOosSharpeRatio: 99.0, // Impossible hurdle
            maxDrawdown: 0.001,
            minRegimeConsistencyScore: 0.99,
            conservativeFrictionBps: 20,
            adverseFrictionBps: 50,
            minTestTrades: 5,
          },
        },
      });

      const res = await pipeline.discoverAndEvaluate(candles);
      expect(res.passedCandidates).toHaveLength(0);
      expect(res.rejectedCandidates.length).toBeGreaterThan(0);

      // Verify pipeline runs cycle with 0 passing candidates safely
      const cycleResult = await pipeline.runCycle({ candles });
      expect(cycleResult.signals).toHaveLength(0);
      expect(cycleResult.routingOutcomes).toHaveLength(0);
    });
  });

  // ============================================================================
  // Group 3: Candidate Ingestion & Signal Adapter Validation (4 tests)
  // ============================================================================
  describe('Group 3: Candidate Ingestion & Signal Adapter Validation', () => {
    it('transitions surviving candidates from DISCOVERED to PAPER_ACTIVE', () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('cand-ingest-01', 'momentum-breakout', true);

      const transition = pipeline.ingestCandidateToPaper(cand, 'Surpassed survival gate');
      expect(transition.fromState).toBe('DISCOVERED');
      expect(transition.toState).toBe('PAPER_ACTIVE');

      const sm = pipeline.getLifecycleStateMachine(cand.strategyId);
      expect(sm?.getState()).toBe('PAPER_ACTIVE');
    });

    it('generates valid AISignal from DiscoveredAlphaCandidate via candidateToAISignal', () => {
      const cand = createDummyCandidate('cand-sig-01', 'trend-following', true);
      const signal = candidateToAISignal(cand, 'TREND_UP', 'BUY', 'BTC/USDT');

      expect(signal.strategyId).toBe('cand-sig-01');
      expect(signal.symbol).toBe('BTC/USDT');
      expect(signal.direction).toBe('BUY');
      expect(signal.regime).toBe('TREND_UP');
      expect(signal.confidence).toBe(0.85);
      expect(signal.expectancy).toBeGreaterThan(0);
      expect(signal.timestamp).toBeGreaterThan(0);
    });

    it('rejects signals with confidence below threshold via AISignalAdapter', async () => {
      const adapter = new AISignalAdapter({ confidenceThreshold: 0.75, minExpectancy: 0.01 });
      const pipeline = createPipeline({ signalAdapter: adapter });
      await pipeline.start();

      const signal: AISignal = {
        strategyId: 'strat-low-conf',
        signalId: 'sig-low',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        action: 'BUY',
        confidence: 0.50, // Below 0.75 threshold
        expectancy: 0.05,
        regime: 'TREND_UP',
        timestamp: Date.now(),
      };

      const outcomes = await pipeline.processSignals([signal], 50_000);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.status).toBe('REJECTED');
      expect(outcomes[0]?.validation.valid).toBe(false);
      expect(outcomes[0]?.validation.rejectionReasons[0]).toContain('Confidence');
    });

    it('suppresses signals when market regime is not permitted by regimeFilter', async () => {
      const adapter = new AISignalAdapter({
        confidenceThreshold: 0.60,
        minExpectancy: 0.01,
        regimeFilter: ['TREND_UP', 'LOW_VOLATILITY'],
      });
      const pipeline = createPipeline({ signalAdapter: adapter });
      await pipeline.start();

      const signal: AISignal = {
        strategyId: 'strat-bad-regime',
        signalId: 'sig-regime',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        action: 'BUY',
        confidence: 0.85,
        expectancy: 0.05,
        regime: 'HIGH_VOLATILITY', // Disallowed regime
        timestamp: Date.now(),
      };

      const outcomes = await pipeline.processSignals([signal], 50_000);
      expect(outcomes[0]?.status).toBe('REJECTED');
      expect(outcomes[0]?.validation.rejectionReasons[0]).toContain('Regime');
    });
  });

  // ============================================================================
  // Group 4: Position Sizing & Paper Execution Routing (4 tests)
  // ============================================================================
  describe('Group 4: Position Sizing & Paper Execution Routing', () => {
    it('sizes valid BUY signal via RegimeAwareKelly and executes paper trade', async () => {
      const executor = new PaperExecutor({ initialBalance: 100_000, simulateFillRate: 1.0 });
      const pipeline = createPipeline({ paperExecutor: executor });
      await pipeline.start(100_000, true);

      const cand = createDummyCandidate('strat-kelly-buy', 'momentum-breakout', true);
      pipeline.ingestCandidateToPaper(cand);

      const signal = candidateToAISignal(cand, 'TREND_UP', 'BUY', 'BTC/USDT');
      const outcomes = await pipeline.processSignals([signal], 50_000);

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.status).toBe('FILLED');
      expect(outcomes[0]?.tradeSignal).toBeDefined();
      expect(outcomes[0]?.tradeSignal?.quantity).toBeGreaterThan(0);
      expect(outcomes[0]?.fillRecord).toBeDefined();
      expect(outcomes[0]?.fillRecord?.side).toBe('buy');
    });

    it('suppresses order execution when market enters SHOCK regime (allocation 0, B16.3)', async () => {
      const pipeline = createPipeline();
      await pipeline.start(100_000, true);

      const cand = createDummyCandidate('strat-shock-regime', 'trend-following', true);
      pipeline.ingestCandidateToPaper(cand);

      const signal = candidateToAISignal(cand, 'SHOCK', 'BUY', 'BTC/USDT');
      const outcomes = await pipeline.processSignals([signal], 50_000);

      expect(outcomes[0]?.status).toBe('ZERO_SIZE');
      expect(outcomes[0]?.tradeSignal?.quantity).toBe(0);
      expect(outcomes[0]?.executionResult).toBeUndefined();
    });

    it('blocks buy order execution when tiered drawdown circuit breaker is active', async () => {
      const drawdownBreaker = new TieredDrawdownBreaker(100_000, {
        alertThreshold: 0.05,
        reduceThreshold: 0.10,
        haltThreshold: 0.15,
        hardStopThreshold: 0.20,
      });
      drawdownBreaker.reset(100_000);
      // Simulate drawdown exceeding 15% (triggering HALT)
      drawdownBreaker.update(80_000);

      const pipeline = createPipeline({ drawdownBreaker });
      await pipeline.start(100_000, true);

      const cand = createDummyCandidate('strat-halted-breaker', 'mean-reversion', true);
      pipeline.ingestCandidateToPaper(cand);

      const signal = candidateToAISignal(cand, 'TREND_UP', 'BUY', 'BTC/USDT');
      const outcomes = await pipeline.processSignals([signal], 50_000);

      expect(outcomes[0]?.status).toBe('REJECTED');
      expect(outcomes[0]?.reason).toContain('Circuit breaker active');
    });

    it('updates open positions, balance, and mark-to-market equity curve', async () => {
      const executor = new PaperExecutor({ initialBalance: 100_000, simulateFillRate: 1.0 });
      const pipeline = createPipeline({ paperExecutor: executor });
      await pipeline.start(100_000, true);

      const cand = createDummyCandidate('strat-positions-test', 'momentum-breakout', true);
      pipeline.ingestCandidateToPaper(cand);

      const signal = candidateToAISignal(cand, 'TREND_UP', 'BUY', 'BTC/USDT');
      await pipeline.processSignals([signal], 50_000);

      const status = await pipeline.getStatus();
      expect(status.openPositions.length).toBeGreaterThan(0);
      expect(status.highWaterMark).toBeGreaterThanOrEqual(100_000);

      const curve = pipeline.getPaperRouter().getEquityCurve();
      expect(curve.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Group 5: Statistical Promotion Gates & Retirement (4 tests)
  // ============================================================================
  describe('Group 5: Statistical Promotion Gates & Retirement', () => {
    it('promotes paper strategy to PROMOTED_LIVE_ELIGIBLE when all 10+1 gates pass', async () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('strat-promo-pass', 'momentum-breakout', true);
      pipeline.ingestCandidateToPaper(cand);

      const gateInput = makeGateEvaluatorInput(); // 35 days, 60 trades, 65% WR, profit factor 1.85
      const gateInputs = new Map([[cand.strategyId, gateInput]]);

      const transitions = await pipeline.evaluatePromotions(gateInputs);
      expect(transitions).toHaveLength(1);
      expect(transitions[0]?.fromState).toBe('PAPER_ACTIVE');
      expect(transitions[0]?.toState).toBe('PROMOTED_LIVE_ELIGIBLE');

      const sm = pipeline.getLifecycleStateMachine(cand.strategyId);
      expect(sm?.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(sm?.isLiveEligible()).toBe(true);
    });

    it('triggers immediate retirement on severe drawdown breach (> 15%)', async () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('strat-drawdown-retire', 'momentum-breakout', true);
      pipeline.ingestCandidateToPaper(cand);

      // Max drawdown = 0.18 (> 0.15 threshold)
      const gateInput = makeGateEvaluatorInput({
        equityCurve: [
          { timestamp: '2025-01-01T00:00:00Z', equity: 1.0 },
          { timestamp: '2025-01-15T00:00:00Z', equity: 0.81 }, // 19% drawdown
        ],
      });
      const gateInputs = new Map([[cand.strategyId, gateInput]]);

      const transitions = await pipeline.evaluatePromotions(gateInputs);
      expect(transitions).toHaveLength(1);
      expect(transitions[0]?.toState).toBe('RETIRED');
      expect(transitions[0]?.reason).toContain('Drawdown breach');

      const sm = pipeline.getLifecycleStateMachine(cand.strategyId);
      expect(sm?.getState()).toBe('RETIRED');
      expect(sm?.isRetired()).toBe(true);
    });

    it('triggers retirement on persistent negative expectancy (< 45% win rate after 15 trades)', async () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('strat-expectancy-retire', 'mean-reversion', true);
      pipeline.ingestCandidateToPaper(cand);

      // 20 trades, 30% win rate, -$1500 net PnL
      const losingTrades = Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() - (20 - i) * 3600 * 1000).toISOString(),
        entryTime: Date.now() - 3600 * 1000,
        exitTime: Date.now(),
        side: 'buy' as const,
        entryPrice: 50000,
        exitPrice: i < 6 ? 50100 : 49800,
        size: 1,
        pnl: i < 6 ? 100 : -200,
      }));

      const gateInput = makeGateEvaluatorInput({
        trades: losingTrades,
      });
      const gateInputs = new Map([[cand.strategyId, gateInput]]);

      const transitions = await pipeline.evaluatePromotions(gateInputs);
      expect(transitions).toHaveLength(1);
      expect(transitions[0]?.toState).toBe('RETIRED');
      expect(transitions[0]?.reason).toContain('Persistent negative expectancy');
    });

    it('records promotion and retirement transitions into ledger and run cards', async () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('strat-promo-ledger', 'volatility-breakout', true);
      pipeline.ingestCandidateToPaper(cand);

      const gateInput = makeGateEvaluatorInput();
      const gateInputs = new Map([[cand.strategyId, gateInput]]);
      await pipeline.evaluatePromotions(gateInputs);

      const records = await readLedgerRecords(ledgerPath);
      const promoRecord = records.find((r) => r.lifecycleState === 'PROMOTED_LIVE_ELIGIBLE');
      expect(promoRecord).toBeDefined();
      expect(promoRecord?.resultClass).toBe('LIVE_PROMOTED');
      expect(verifyLedgerChain(records)).toBe(-1);

      // Verify updated run card
      const cardPath = join(runCardDir, cand.strategyId, 'run_card.json');
      const card = JSON.parse(await readFile(cardPath, 'utf8'));
      expect(card.resultClass).toBe('LIVE_PROMOTED');
    });
  });

  // ============================================================================
  // Group 6: Live Pre-Trade Risk Verification Handoff (4 tests)
  // ============================================================================
  describe('Group 6: Live Pre-Trade Risk Verification Handoff', () => {
    const dummyOrder: PolymarketOrder = {
      orderId: 'poly-ord-1',
      tokenID: '0x123',
      side: 'BUY',
      price: 0.55,
      size: 500,
      expiration: 0,
      nonce: '1',
      feeRateBps: 0,
      signatureType: 0,
    };

    it('rejects live orders for strategies in DISCOVERED or PAPER_ACTIVE state', () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('strat-live-premature', 'trend-following', true);
      pipeline.ingestCandidateToPaper(cand); // In PAPER_ACTIVE state

      const verdict = pipeline.evaluateLiveOrder({
        strategyId: cand.strategyId,
        order: dummyOrder,
      });

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(false);
      expect(verdict.reason).toContain('is not eligible for live execution');
    });

    it('approves live order for PROMOTED_LIVE_ELIGIBLE strategy within risk limits', async () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('strat-live-promoted', 'trend-following', true);
      pipeline.ingestCandidateToPaper(cand);

      const gateInput = makeGateEvaluatorInput();
      await pipeline.evaluatePromotions(new Map([[cand.strategyId, gateInput]]));

      const verdict = pipeline.evaluateLiveOrder({
        strategyId: cand.strategyId,
        order: dummyOrder,
      });

      expect(verdict.approved).toBe(true);
      expect(verdict.checks.promotionEligible).toBe(true);
      expect(verdict.checks.signalTtlOk).toBe(true);
      expect(verdict.checks.positionSizeOk).toBe(true);
    });

    it('rejects live order when signal TTL exceeds 200ms', async () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('strat-live-stale', 'trend-following', true);
      pipeline.ingestCandidateToPaper(cand);

      const gateInput = makeGateEvaluatorInput();
      await pipeline.evaluatePromotions(new Map([[cand.strategyId, gateInput]]));

      const staleSignal: AISignal = {
        strategyId: cand.strategyId,
        signalId: 'sig-stale',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        action: 'BUY',
        confidence: 0.95,
        expectancy: 0.05,
        regime: 'TREND_UP',
        timestamp: Date.now() - 500, // 500ms > 200ms TTL
      };

      const verdict = pipeline.evaluateLiveOrder({
        strategyId: cand.strategyId,
        order: dummyOrder,
        signal: staleSignal,
      });

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.signalTtlOk).toBe(false);
      expect(verdict.reason).toContain('STALE_SIGNAL');
    });

    it('halts live order routing when LiveExecutionGuard trips circuit breaker (B16.4)', async () => {
      const pipeline = createPipeline();
      const cand = createDummyCandidate('strat-live-breaker', 'trend-following', true);
      pipeline.ingestCandidateToPaper(cand);

      const gateInput = makeGateEvaluatorInput();
      await pipeline.evaluatePromotions(new Map([[cand.strategyId, gateInput]]));

      const coordinator = pipeline.getLiveCoordinator();
      // Trip circuit breaker by recording 3 consecutive losses
      coordinator.recordFillOutcome(cand.strategyId, -100);
      coordinator.recordFillOutcome(cand.strategyId, -100);
      coordinator.recordFillOutcome(cand.strategyId, -100);

      const verdict = pipeline.evaluateLiveOrder({
        strategyId: cand.strategyId,
        order: dummyOrder,
      });

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.circuitBreakerOk).toBe(false);
      expect(verdict.reason).toContain('Circuit breaker tripped');
    });
  });

  // ============================================================================
  // Group 7: Provenance Ledger Integrity & Autonomous Cycle (4 tests)
  // ============================================================================
  describe('Group 7: Provenance Ledger Integrity & Autonomous Cycle', () => {
    it('maintains continuous unbroken SHA-256 cryptographic chain across multiple cycles', async () => {
      const candles = makeTrendUpCandles(120);
      const pipeline = createPipeline({
        discoveryConfig: {
          candles,
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      // Run 2 full cycles
      await pipeline.runCycle({ candles, currentPrice: 50_000 });
      await pipeline.runCycle({ candles, currentPrice: 51_000 });

      const records = await readLedgerRecords(ledgerPath);
      expect(records.length).toBeGreaterThanOrEqual(2);
      expect(records[0]?.prevHash).toBe('');
      expect(records[1]?.prevHash.length).toBe(64);
      expect(verifyLedgerChain(records)).toBe(-1);
    });

    it('detects corrupted/tampered ledger records and halts persistence (B16.5)', async () => {
      const pipeline = createPipeline();
      await appendLedgerRecord(
        { runId: 'r1', configHash: 'h1', resultClass: 'IS', strategyRef: 's', gates: {} },
        ledgerPath,
      );
      await appendLedgerRecord(
        { runId: 'r2', configHash: 'h2', resultClass: 'OOS', strategyRef: 's', gates: {} },
        ledgerPath,
      );

      const records = await readLedgerRecords(ledgerPath);
      const tampered = [{ ...records[0]!, strategyRef: 'hacked' }, records[1]!];
      expect(verifyLedgerChain(tampered)).toBe(1);

      // Startup should detect tampering and throw
      const tamperedFile = join(tempDirObj.path, 'corrupt-ledger.jsonl');
      await appendLedgerRecord(
        { runId: 'r0', configHash: 'h0', resultClass: 'IS', strategyRef: 's', gates: {} },
        tamperedFile,
      );
      await appendLedgerRecord(
        { runId: 'r1', configHash: 'h1', resultClass: 'IS', strategyRef: 's', gates: {} },
        tamperedFile,
      );
      // Corrupt file on disk
      const rawRecords = await readLedgerRecords(tamperedFile);
      rawRecords[0]!.strategyRef = 'tampered-strategy';
      await writeFile(
        tamperedFile,
        rawRecords.map((r) => JSON.stringify(r)).join('\n') + '\n',
        'utf8',
      );
      const corruptPipeline = createPipeline({
        ledgerPath: tamperedFile,
        strictLedgerVerification: true,
      });

      // Start fails when ledger is corrupted
      await expect(corruptPipeline.start()).rejects.toThrow('ledger chain integrity breach');
    });

    it('executes full end-to-end runCycle() producing complete AutonomousCycleResult', async () => {
      const candles = makeMultiRegimeCandles();
      const pipeline = createPipeline({
        discoveryConfig: {
          candles,
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      const cycleResult = await pipeline.runCycle({
        candles,
        currentPrice: 50_000,
        signalDirection: 'BUY',
      });

      expect(cycleResult.cycleId).toContain('cycle-1');
      expect(cycleResult.startedAt).toBeDefined();
      expect(cycleResult.completedAt).toBeDefined();
      expect(cycleResult.durationMs).toBeGreaterThanOrEqual(0);
      expect(cycleResult.discoveryResult).toBeDefined();
      expect(cycleResult.signals).toBeDefined();
      expect(cycleResult.routingOutcomes).toBeDefined();
      expect(cycleResult.promotionTransitions).toBeDefined();
      expect(cycleResult.status).toBeDefined();
      expect(cycleResult.status.isLedgerChainValid).toBe(true);
    });

    it('getStatus() reports accurate strategy distributions and account summaries', async () => {
      const pipeline = createPipeline();
      const cand1 = createDummyCandidate('strat-status-1', 'momentum-breakout', true);
      const cand2 = createDummyCandidate('strat-status-2', 'trend-following', true);

      pipeline.ingestCandidateToPaper(cand1);
      pipeline.ingestCandidateToPaper(cand2);

      const status = await pipeline.getStatus();
      expect(status.totalStrategiesCount).toBe(2);
      expect(status.stateDistribution.PAPER_ACTIVE).toBe(2);
      expect(status.stateDistribution.DISCOVERED).toBe(0);
      expect(status.stateDistribution.PROMOTED_LIVE_ELIGIBLE).toBe(0);
      expect(status.stateDistribution.RETIRED).toBe(0);
      expect(status.isLedgerChainValid).toBe(true);
      expect(status.equity).toBeGreaterThanOrEqual(50_000);
    });
  });
});
