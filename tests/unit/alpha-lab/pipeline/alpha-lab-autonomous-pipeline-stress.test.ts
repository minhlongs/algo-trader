/**
 * Alpha-Lab Autonomous Pipeline Orchestrator — Empirical Stress Test Suite
 *
 * Rigorous adversarial verification for Challenger M4-2:
 * 1. Zero-candidate edge case: complete survival gate failure, diagnostic persistence, zero orders routed
 * 2. Multi-cycle sequential execution: 5 consecutive cycles, state distributions, equity tracking, unbroken hash chain
 * 3. Regime switching stress: SHOCK regime Kelly zero-allocation and order submission suppression
 * 4. Live guard circuit breaker: pre-trade eligibility and 3 consecutive losses halting live routing globally
 * 5. Cryptographic ledger corruption defense (B16.5): startup halt, mid-cycle tamper resistance, strict verification
 *
 * Location: tests/unit/alpha-lab/pipeline/alpha-lab-autonomous-pipeline-stress.test.ts
 */

import { tmpdir } from 'node:os';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

// Configure isolated cashclaw test pool before importing persistent modules
const TEST_POOL_ID = `stress-${process.pid}-${Date.now()}`;
process.env.VITEST_POOL_ID = TEST_POOL_ID;

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
  AlphaLabAutonomousPipeline,
  type AlphaLabAutonomousPipelineConfig,
} from '../../../../src/alpha-lab/pipeline';
import {
  ContinuousDiscoveryPipeline,
  type DiscoveredAlphaCandidate,
} from '../../../../src/alpha-lab/alpha-discovery';
import {
  candidateToAISignal,
  type AISignal,
} from '../../../../src/desk/strategies/ai-signal-adapter';
import { RegimeAwareKelly } from '../../../../src/desk/risk/regime-aware-kelly';
import {
  readLedgerRecords,
  verifyLedgerChain,
  appendLedgerRecord,
  canonicalRecord,
  computeRecordHash,
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

describe('AlphaLabAutonomousPipeline Empirical Stress Tests (Challenger M4-2)', () => {
  let tempDirObj: { path: string; cleanup: () => Promise<void> };
  let ledgerPath: string;
  let runCardDir: string;

  const dummyLiveOrder: PolymarketOrder = {
    orderId: 'stress-poly-ord-1',
    tokenID: '0xabc123',
    side: 'BUY',
    price: 0.50,
    size: 200,
    expiration: 0,
    nonce: '101',
    feeRateBps: 0,
    signatureType: 0,
  };

  beforeEach(async () => {
    tempDirObj = await createTempDir('alpha-stress-test-');
    ledgerPath = join(tempDirObj.path, 'research-ledger.jsonl');
    runCardDir = join(tempDirObj.path, 'run-cards');
    const cashclawDir = join(tmpdir(), `cashclaw-test-${TEST_POOL_ID}`);
    if (existsSync(cashclawDir)) {
      rmSync(cashclawDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    await tempDirObj.cleanup();
  });

  afterAll(() => {
    const cashclawDir = join(tmpdir(), `cashclaw-test-${TEST_POOL_ID}`);
    if (existsSync(cashclawDir)) {
      rmSync(cashclawDir, { recursive: true, force: true });
    }
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

  function createPassingCandidate(
    strategyId = 'strat-stress-passing',
    familyId = 'momentum-breakout',
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
        totalTestTrades: 50,
        testWinRate: 0.70,
        testSharpe: 1.80,
        testProfitFactor: 1.65,
        testMaxDrawdown: 0.07,
        testTotalPnl: 4200,
        consistencyScore: 0.85,
        regimeConsistencyScore: 0.80,
        overfitGap: 0.04,
      },
      survivalGateResult: {
        passed: true,
        evaluatedAt: new Date().toISOString(),
        sharpeRatio: 1.80,
        maxDrawdown: 0.07,
        regimeConsistencyScore: 0.80,
        costStressPassed: true,
        conservativePnl: 3800,
        adversePnl: 3000,
        metrics: {
          oosSharpeRatio: 1.80,
          maxDrawdown: 0.07,
          regimeConsistencyScore: 0.80,
          splitConsistencyScore: 0.85,
          conservativeStressPnl: 3800,
          adverseStressPnl: 3000,
          conservativeStressSharpe: 1.6,
          adverseStressSharpe: 1.3,
          testWinRate: 0.70,
          testProfitFactor: 1.65,
          totalTestTrades: 50,
        },
        checks: {
          sharpePassed: true,
          drawdownPassed: true,
          regimeConsistencyPassed: true,
          costStressConservativePassed: true,
          costStressAdversePassed: true,
        },
        gateChecks: {
          sharpePassed: true,
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
        failures: [],
        rejectionReasons: [],
      },
      status: 'PASSED',
    };
  }

  // ============================================================================
  // Challenge 1: Zero-Candidate Survival Gate Failure Edge Case
  // ============================================================================
  describe('Challenge 1: Zero-Candidate Edge Case & Gate Failure Handling', () => {
    it('executes smoothly without throwing when 100% of candidates fail survival gates', async () => {
      const candles = makeMultiRegimeCandles();
      // Configure impossibly high survival hurdles to force 100% rejection rate
      const pipeline = createPipeline({
        discoveryConfig: {
          candles,
          survivalGates: {
            minOosSharpeRatio: 999.0, // Impossible hurdle
            maxDrawdown: 0.001,       // Impossibly tight DD
          },
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      await pipeline.start();

      const cycleResult = await pipeline.runCycle({
        candles,
        currentPrice: 50_000,
        signalDirection: 'BUY',
      });

      // 1. Pipeline runs smoothly without throwing unhandled exceptions
      expect(cycleResult).toBeDefined();
      expect(cycleResult.cycleId).toContain('cycle-1');

      // 2. Discovery evaluated candidates but none passed survival gates
      const discovery = cycleResult.discoveryResult;
      expect(discovery.allCandidates.length).toBeGreaterThan(0);
      expect(discovery.passedCandidates).toHaveLength(0);
      expect(discovery.rejectedCandidates).toHaveLength(discovery.allCandidates.length);

      // 3. Structured rejection diagnostics recorded for every rejected candidate
      for (const rejected of discovery.rejectedCandidates) {
        expect(rejected.status).toBe('REJECTED');
        expect(rejected.rejectionDiagnostics).toBeDefined();
        expect(rejected.rejectionDiagnostics!.length).toBeGreaterThan(0);

        const diag = rejected.rejectionDiagnostics![0]!;
        expect(diag.metric).toBeDefined();
        expect(diag.reason.length).toBeGreaterThan(0);
        expect(diag.refinementHypothesis.length).toBeGreaterThan(0);

        // Check RunCard on disk for rejection diagnostics
        const runCardJsonPath = join(runCardDir, rejected.strategyId, 'run_card.json');
        const rawCard = await readFile(runCardJsonPath, 'utf8');
        const cardObj = JSON.parse(rawCard) as { resultClass: string; warnings: string[] };
        expect(cardObj.resultClass).toBe('REJECTED');
        expect(cardObj.warnings.length).toBeGreaterThan(0);
      }

      // 4. Zero signals generated, zero orders routed, zero positions opened
      expect(cycleResult.signals).toHaveLength(0);
      expect(cycleResult.routingOutcomes).toHaveLength(0);
      expect(cycleResult.promotionTransitions).toHaveLength(0);

      const paperPositions = pipeline.getStatus();
      const status = await paperPositions;
      expect(status.openPositions).toHaveLength(0);
      expect(status.equity).toBe(50_000);
      expect(status.stateDistribution.PAPER_ACTIVE).toBe(0);
      expect(status.stateDistribution.DISCOVERED).toBe(discovery.allCandidates.length);
      expect(status.stateDistribution.PROMOTED_LIVE_ELIGIBLE).toBe(0);
      expect(status.stateDistribution.RETIRED).toBe(0);

      // 5. Cryptographic ledger was written for rejected runs with intact chain
      const ledgerRecords = await readLedgerRecords(ledgerPath);
      expect(ledgerRecords.length).toBe(discovery.allCandidates.length);
      for (const rec of ledgerRecords) {
        expect(rec.resultClass).toBe('REJECTED');
        expect(rec.lifecycleState).toBe('DISCOVERED');
      }
      expect(verifyLedgerChain(ledgerRecords)).toBe(-1);
    });

    it('handles discovery producing zero candidates safely without side effects', async () => {
      // Mock discovery pipeline returning empty candidates
      const mockDiscovery = new ContinuousDiscoveryPipeline({
        candles: [],
      });
      // Force empty candidates return
      mockDiscovery.runCycle = async () => ({
        allCandidates: [],
        passedCandidates: [],
        rejectedCandidates: [],
        summary: {
          totalEvaluated: 0,
          passedCount: 0,
          rejectedCount: 0,
          passRate: 0,
          familiesEvaluated: [],
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1,
          dataSource: [],
        },
      });

      const pipeline = createPipeline({ discoveryPipeline: mockDiscovery });
      await pipeline.start();

      const cycleResult = await pipeline.runCycle({ currentPrice: 50_000 });
      expect(cycleResult.signals).toHaveLength(0);
      expect(cycleResult.routingOutcomes).toHaveLength(0);
      expect(cycleResult.status.totalStrategiesCount).toBe(0);
      expect(cycleResult.status.openPositions).toHaveLength(0);
      expect(cycleResult.status.isLedgerChainValid).toBe(true);
    });
  });

  // ============================================================================
  // Challenge 2: Multi-Cycle Execution (5 consecutive cycles)
  // ============================================================================
  describe('Challenge 2: Multi-Cycle Execution & Provenance Hash Chain', () => {
    it('executes 5 consecutive cycles maintaining distributions, equity tracking, and an unbroken SHA-256 chain', async () => {
      const candles = makeTrendUpCandles(120);
      const pipeline = createPipeline({
        discoveryConfig: {
          candles,
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      await pipeline.start();

      const prices = [50_000, 50_200, 50_500, 50_300, 50_800];
      const cycleResults = [];

      for (let i = 0; i < 5; i++) {
        const cycleRes = await pipeline.runCycle({
          candles,
          currentPrice: prices[i],
          signalDirection: 'BUY',
        });
        cycleResults.push(cycleRes);
      }

      // 1. Verify 5 consecutive cycle results
      expect(cycleResults).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        const res = cycleResults[i]!;
        expect(res.cycleId).toContain(`cycle-${i + 1}-`);
        expect(res.startedAt).toBeDefined();
        expect(res.completedAt).toBeDefined();
        expect(res.durationMs).toBeGreaterThanOrEqual(0);
        expect(new Date(res.completedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(res.startedAt).getTime(),
        );
      }

      // 2. Operational status after 5 cycles
      const finalStatus = await pipeline.getStatus();
      expect(finalStatus.cycleCount).toBe(5);
      expect(finalStatus.lastCycleAt).toBeDefined();
      expect(finalStatus.isRunning).toBe(true);
      expect(finalStatus.totalStrategiesCount).toBeGreaterThan(0);

      // Verify state distributions sum to total strategies
      const dist = finalStatus.stateDistribution;
      const totalFromDist =
        dist.DISCOVERED + dist.PAPER_ACTIVE + dist.PROMOTED_LIVE_ELIGIBLE + dist.RETIRED;
      expect(totalFromDist).toBe(finalStatus.totalStrategiesCount);

      // 3. Equity and high-water mark tracking across cycles
      expect(finalStatus.equity).toBeGreaterThan(0);
      expect(Number.isFinite(finalStatus.equity)).toBe(true);
      expect(finalStatus.highWaterMark).toBeGreaterThanOrEqual(finalStatus.equity);
      expect(finalStatus.maxHistoricalDrawdown).toBeGreaterThanOrEqual(0);
      expect(finalStatus.maxHistoricalDrawdown).toBeLessThanOrEqual(1.0);

      // 4. Unbroken cryptographic ledger hash chain verification
      const records = await readLedgerRecords(ledgerPath);
      expect(records.length).toBeGreaterThanOrEqual(5);

      // Global chain verification
      const brokenIndex = verifyLedgerChain(records);
      expect(brokenIndex).toBe(-1);

      // Explicit pairwise cryptographic verification
      expect(records[0]!.prevHash).toBe('');
      for (let k = 1; k < records.length; k++) {
        const prevRec = records[k - 1]!;
        const currRec = records[k]!;

        const expectedPrevHash = computeRecordHash(prevRec);
        expect(currRec.prevHash).toBe(expectedPrevHash);
        expect(currRec.prevHash).toHaveLength(64); // Valid SHA-256 hex string

        if (currRec.entryHash) {
          const expectedEntryHash = computeRecordHash(currRec);
          expect(currRec.entryHash).toBe(expectedEntryHash);
        }
      }
    });
  });

  // ============================================================================
  // Challenge 3: Regime Switching Stress & SHOCK Allocation Suppression
  // ============================================================================
  describe('Challenge 3: Regime Switching Stress & SHOCK Sizing Suppression', () => {
    it('strictly zeroes out Kelly allocation when regime is SHOCK', () => {
      const sizer = new RegimeAwareKelly({
        kelly: {
          kellyFraction: 0.25,
          maxPositionFraction: 0.05,
          minPositionUsd: 1.0,
          isManagedCapital: true,
        },
        regimeMultipliers: {
          TREND_UP: 1.25,
          TREND_DOWN: 0.50,
          RANGE: 1.00,
          HIGH_VOLATILITY: 0.50,
          LOW_VOLATILITY: 1.10,
          SHOCK: 0.00,
          UNKNOWN: 0.75,
        },
        unknownRegimeMultiplier: 0.75,
      });

      const sizingInput = {
        portfolioValue: 50_000,
        winProbability: 0.65,
        winLossRatio: 1.5,
      };

      // Favorable regime sizing: TREND_UP (1.25x)
      const trendUpResult = sizer.size(sizingInput, 'TREND_UP');
      expect(trendUpResult.positionSizeUsd).toBeGreaterThan(0);
      expect(trendUpResult.fractionUsed).toBeGreaterThan(0);
      expect(trendUpResult.portfolioPercent).toBeGreaterThan(0);

      // Stress regime sizing: SHOCK (0.00x multiplier)
      const shockResult = sizer.size(sizingInput, 'SHOCK');
      expect(shockResult.positionSizeUsd).toBe(0);
      expect(shockResult.fractionUsed).toBe(0);
      expect(shockResult.portfolioPercent).toBe(0);
      expect(shockResult.kellyAdjusted).toBe(0);
    });

    it('suppresses order execution and halts submission when transitioning to SHOCK regime', async () => {
      const pipeline = createPipeline();
      await pipeline.start();

      const cand = createPassingCandidate('strat-shock-transition');
      pipeline.ingestCandidateToPaper(cand);

      // Phase 1: In TREND_UP regime, BUY signal sizes position and opens trade
      const trendSignal = candidateToAISignal(cand, 'TREND_UP', 'BUY', 'BTC/USDT');
      const trendOutcomes = await pipeline.processSignals([trendSignal], 50_000);

      expect(trendOutcomes).toHaveLength(1);
      expect(trendOutcomes[0]!.status).toBe('FILLED');
      expect(trendOutcomes[0]!.tradeSignal?.quantity).toBeGreaterThan(0);

      const positionsAfterTrend = pipeline.getStatus();
      const openPositions1 = (await positionsAfterTrend).openPositions;
      expect(openPositions1.length).toBeGreaterThan(0);
      const initialQuantity = openPositions1[0]!.quantity;

      // Phase 2: Market transitions into SHOCK regime
      const shockSignal = candidateToAISignal(cand, 'SHOCK', 'BUY', 'BTC/USDT');
      const shockOutcomes = await pipeline.processSignals([shockSignal], 50_000);

      expect(shockOutcomes).toHaveLength(1);
      const shockOutcome = shockOutcomes[0]!;

      // Verify order routing was HALTED with ZERO_SIZE status
      expect(shockOutcome.status).toBe('ZERO_SIZE');
      expect(shockOutcome.reason).toContain('Regime is SHOCK: zero allocation enforced');
      expect(shockOutcome.tradeSignal?.quantity).toBe(0);
      expect(shockOutcome.fillRecord).toBeUndefined();

      // Verify no additional position quantity was added
      const positionsAfterShock = await pipeline.getStatus();
      const openPositions2 = positionsAfterShock.openPositions;
      expect(openPositions2[0]!.quantity).toBe(initialQuantity);
    });

    it('runCycle with explicit SHOCK regime override produces zero order fills', async () => {
      const candles = makeMultiRegimeCandles();
      const pipeline = createPipeline({
        adapterConfig: {
          confidenceThreshold: 0.2,
          minExpectancy: 0.0,
        },
        discoveryConfig: {
          candles,
          survivalGates: {
            minOosSharpeRatio: 0.1, // Lenient gates to allow candidates to pass
            maxDrawdown: 0.50,
            minRegimeConsistencyScore: 0.1,
          },
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      await pipeline.start();

      // Execute cycle with explicit SHOCK regime override
      const cycleResult = await pipeline.runCycle({
        candles,
        regime: 'SHOCK',
        currentPrice: 50_000,
        signalDirection: 'BUY',
      });

      expect(cycleResult.signals.length).toBeGreaterThan(0);
      for (const sig of cycleResult.signals) {
        expect(sig.regime).toBe('SHOCK');
      }

      // Every passing candidate routed during SHOCK must be ZERO_SIZE
      for (const outcome of cycleResult.routingOutcomes) {
        expect(outcome.status).toBe('ZERO_SIZE');
        expect(outcome.reason).toContain('SHOCK');
        expect(outcome.fillRecord).toBeUndefined();
      }

      // Paper account must have 0 open positions
      const status = await pipeline.getStatus();
      expect(status.openPositions).toHaveLength(0);
    });
  });

  // ============================================================================
  // Challenge 4: Live Guard Circuit Breaker Enforcement
  // ============================================================================
  describe('Challenge 4: Live Guard Circuit Breaker Enforcement', () => {
    it('strictly enforces promotion eligibility before permitting live order handoff', () => {
      const pipeline = createPipeline();
      const cand = createPassingCandidate('strat-live-precheck');

      // 1. Candidate in DISCOVERED state: rejected
      let verdict = pipeline.evaluateLiveOrder({
        strategyId: cand.strategyId,
        order: dummyLiveOrder,
      });
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(false);
      expect(verdict.reason).toContain('not eligible for live execution');

      // 2. Candidate in PAPER_ACTIVE state: still rejected
      pipeline.ingestCandidateToPaper(cand);
      verdict = pipeline.evaluateLiveOrder({
        strategyId: cand.strategyId,
        order: dummyLiveOrder,
      });
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(false);
    });

    it('trips circuit breaker after consecutive losses and halts all subsequent live orders', async () => {
      const pipeline = createPipeline();
      const cand1 = createPassingCandidate('strat-promoted-1');
      const cand2 = createPassingCandidate('strat-promoted-2');

      pipeline.ingestCandidateToPaper(cand1);
      pipeline.ingestCandidateToPaper(cand2);

      // Promote both strategies to PROMOTED_LIVE_ELIGIBLE
      const gateInput1 = makeGateEvaluatorInput();
      const gateInput2 = makeGateEvaluatorInput();
      await pipeline.evaluatePromotions(
        new Map([
          [cand1.strategyId, gateInput1],
          [cand2.strategyId, gateInput2],
        ]),
      );

      const sm1 = pipeline.getLifecycleStateMachine(cand1.strategyId);
      const sm2 = pipeline.getLifecycleStateMachine(cand2.strategyId);
      expect(sm1?.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(sm2?.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');

      // 1. Initial live order is approved
      const vInitial = pipeline.evaluateLiveOrder({
        strategyId: cand1.strategyId,
        order: dummyLiveOrder,
      });
      expect(vInitial.approved).toBe(true);
      expect(vInitial.checks.circuitBreakerOk).toBe(true);

      const coordinator = pipeline.getLiveCoordinator();

      // 2. Record 1st loss: circuit breaker still open
      coordinator.recordFillOutcome(cand1.strategyId, -100);
      let vStep = pipeline.evaluateLiveOrder({
        strategyId: cand1.strategyId,
        order: dummyLiveOrder,
      });
      expect(vStep.approved).toBe(true);
      expect(vStep.checks.circuitBreakerOk).toBe(true);

      // 3. Record 2nd loss: circuit breaker still open
      coordinator.recordFillOutcome(cand1.strategyId, -100);
      vStep = pipeline.evaluateLiveOrder({
        strategyId: cand1.strategyId,
        order: dummyLiveOrder,
      });
      expect(vStep.approved).toBe(true);
      expect(vStep.checks.circuitBreakerOk).toBe(true);

      // 4. Record 3rd consecutive loss: circuit breaker TRIPS (threshold = 3)
      coordinator.recordFillOutcome(cand1.strategyId, -100);

      // 5. Subsequent live order for cand1 must be HALTED
      const vTripped1 = pipeline.evaluateLiveOrder({
        strategyId: cand1.strategyId,
        order: dummyLiveOrder,
      });
      expect(vTripped1.approved).toBe(false);
      expect(vTripped1.checks.circuitBreakerOk).toBe(false);
      expect(vTripped1.reason).toContain('Circuit breaker tripped');

      // 6. Global protection: subsequent live order for cand2 must ALSO be halted
      const vTripped2 = pipeline.evaluateLiveOrder({
        strategyId: cand2.strategyId,
        order: dummyLiveOrder,
      });
      expect(vTripped2.approved).toBe(false);
      expect(vTripped2.checks.circuitBreakerOk).toBe(false);
      expect(vTripped2.reason).toContain('Circuit breaker tripped');

      // 7. Verify status reports circuit breaker tripped
      const liveStatus = coordinator.getStatus();
      expect(liveStatus.guardStatus.circuitTripped).toBe(true);
      expect(liveStatus.guardStatus.consecutiveLosses).toBe(3);
    });
  });

  // ============================================================================
  // Challenge 5: Cryptographic Ledger Corruption Defense (B16.5)
  // ============================================================================
  describe('Challenge 5: Cryptographic Ledger Corruption Defense (B16.5)', () => {
    it('halts startup when ledger file on disk has a corrupted record', async () => {
      // Create 3 valid records on disk
      await appendLedgerRecord(
        { runId: 'rec-0', configHash: 'hash-0', resultClass: 'IS', strategyRef: 'strat-0', gates: {} },
        ledgerPath,
      );
      await appendLedgerRecord(
        { runId: 'rec-1', configHash: 'hash-1', resultClass: 'OOS', strategyRef: 'strat-1', gates: {} },
        ledgerPath,
      );
      await appendLedgerRecord(
        { runId: 'rec-2', configHash: 'hash-2', resultClass: 'PAPER', strategyRef: 'strat-2', gates: {} },
        ledgerPath,
      );

      const recordsBefore = await readLedgerRecords(ledgerPath);
      expect(verifyLedgerChain(recordsBefore)).toBe(-1);

      // Tamper with record 1 on disk: change strategyRef
      recordsBefore[1]!.strategyRef = 'tampered-compromised-strategy';
      await writeFile(
        ledgerPath,
        recordsBefore.map((r) => JSON.stringify(r)).join('\n') + '\n',
        'utf8',
      );

      // Instantiate pipeline with strict verification enabled
      const pipeline = createPipeline({
        ledgerPath,
        strictLedgerVerification: true,
      });

      // Pipeline start() must detect breach and throw immediately
      await expect(pipeline.start()).rejects.toThrow(/ledger chain integrity breach detected at record index/);
    });

    it('halts persistence during execution when ledger file is tampered with', async () => {
      // Start pipeline with valid ledger
      const pipeline = createPipeline({
        ledgerPath,
        strictLedgerVerification: true,
      });
      await pipeline.start();

      // Write initial valid record
      await appendLedgerRecord(
        { runId: 'init-0', configHash: 'hash-0', resultClass: 'IS', strategyRef: 'strat-0', gates: {} },
        ledgerPath,
      );
      await appendLedgerRecord(
        { runId: 'init-1', configHash: 'hash-1', resultClass: 'OOS', strategyRef: 'strat-1', gates: {} },
        ledgerPath,
      );

      const records = await readLedgerRecords(ledgerPath);
      expect(records).toHaveLength(2);
      expect(verifyLedgerChain(records)).toBe(-1);

      // External attacker tampers with init-0 entryHash on disk
      records[0]!.entryHash = '0000000000000000000000000000000000000000000000000000000000000000';
      await writeFile(
        ledgerPath,
        records.map((r) => JSON.stringify(r)).join('\n') + '\n',
        'utf8',
      );

      // Ingest candidate to trigger persistLedgerRecord
      const cand = createPassingCandidate('strat-mid-tamper');
      pipeline.ingestCandidateToPaper(cand);

      // Wait a moment for serialized ledger queue
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify that persistence was HALTED: line count did NOT increase to 3
      const recordsAfter = await readLedgerRecords(ledgerPath);
      expect(recordsAfter).toHaveLength(2);

      // Pipeline status flags the breach
      const status = await pipeline.getStatus();
      expect(status.isLedgerChainValid).toBe(false);
    });

    it('detects tampered prevHash pointer and flags exact corrupted index', async () => {
      await appendLedgerRecord(
        { runId: 'rec-p0', configHash: 'h0', resultClass: 'IS', strategyRef: 's0', gates: {} },
        ledgerPath,
      );
      await appendLedgerRecord(
        { runId: 'rec-p1', configHash: 'h1', resultClass: 'OOS', strategyRef: 's1', gates: {} },
        ledgerPath,
      );

      const raw = await readLedgerRecords(ledgerPath);
      // Corrupt prevHash pointer
      raw[1]!.prevHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      await writeFile(ledgerPath, raw.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

      const corrupted = await readLedgerRecords(ledgerPath);
      const brokenIndex = verifyLedgerChain(corrupted);
      expect(brokenIndex).toBe(1);

      const pipeline = createPipeline({ ledgerPath, strictLedgerVerification: true });
      await expect(pipeline.start()).rejects.toThrow('record index 1');
    });

    it('bypasses startup error when strictLedgerVerification is explicitly disabled', async () => {
      await appendLedgerRecord(
        { runId: 'rec-b0', configHash: 'h0', resultClass: 'IS', strategyRef: 's0', gates: {} },
        ledgerPath,
      );
      await appendLedgerRecord(
        { runId: 'rec-b1', configHash: 'h1', resultClass: 'OOS', strategyRef: 's1', gates: {} },
        ledgerPath,
      );

      // Corrupt ledger
      const raw = await readLedgerRecords(ledgerPath);
      raw[0]!.strategyRef = 'corrupted';
      await writeFile(ledgerPath, raw.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

      // With strictLedgerVerification: false, pipeline starts without throwing
      const pipeline = createPipeline({
        ledgerPath,
        strictLedgerVerification: false,
      });

      await expect(pipeline.start()).resolves.toBeUndefined();
      expect((await pipeline.getStatus()).isRunning).toBe(true);
      // Chain validation flag in status correctly still reports invalid
      expect((await pipeline.getStatus()).isLedgerChainValid).toBe(false);
    });
  });
});
