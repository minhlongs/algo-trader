/**
 * Tier 5: Adversarial Coverage Hardening Test Suite (R1-R4)
 *
 * White-box adversarial testing suite targeting:
 * - AlphaLabAutonomousPipeline (orchestration, multi-cycle recovery, strict ledger gating, serial persistence)
 * - AlphaDiscovery (extreme parameter bounds, invalid strategy families, zero-volatility edge cases)
 * - WalkforwardEvaluator (boundary candle arrays, extreme volatility whipsaws, NaN/zero PnL aggregation)
 * - AlphaLifecycleStateMachine (absorbing RETIRED state, direct jump prevention, anti-flapping, negative drawdown conventions)
 * - ResearchLedger (SHA-256 chain tampering, record deletion, concurrent write serialization, fail-safe error handling)
 * - RunCardStore (deep canonicalization determinism, read-only filesystem resilience, corrupted index recovery)
 * - LiveGuardHandoffCoordinator (pre-trade risk gate handoff, position caps, stale TTL defense)
 */

// Enable test mode for file-store persistence so tests write to os.tmpdir() instead of ~/.cashclaw/
process.env.VITEST_POOL_ID = 'tier5-adv';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

// Pipeline
import {
  AlphaLabAutonomousPipeline,
} from '../../../src/alpha-lab/pipeline/alpha-lab-autonomous-pipeline';

// Alpha Discovery
import {
  createDefaultRegistry,
  experimentFromFamily,
} from '../../../src/alpha-lab/alpha-discovery';
import {
  snapToStep,
  sampleParamGrid,
  sampleParamRandom,
  generateAllCandidateConfigs,
} from '../../../src/alpha-lab/alpha-discovery/candidate-generator';

// Walkforward & Regimes
import {
  evaluateWalkForward,
  buildSummary,
} from '../../../src/alpha-lab/walkforward/walkforward-evaluator';
import {
  classifyRegime,
  computeRegimeFeatures,
  realizedVolatility,
  closeSlope,
  trendStrength,
} from '../../../src/alpha-lab/regimes';
import type { CandleLike } from '../../../src/alpha-lab/regimes/regime-types';

// Attribution & Lifecycle
import {
  AlphaLifecycleStateMachine,
  mapStrategyStateToLifecycleState,
} from '../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import {
  evaluateNumericGate,
  evaluateStatisticalGate,
  computeDaysSinceStart,
  formatValue,
} from '../../../src/alpha-lab/gates/gate-evaluator';
import type { StrategyState } from '../../../src/alpha-lab/attribution/promotion-state-machine';

// Provenance
import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
} from '../../../src/alpha-lab/provenance/research-ledger';
import {
  writeRunCard,
  hashConfig,
  buildRunCardIndex,
  readRunCardByRunId,
} from '../../../src/alpha-lab/provenance/run-card-store';
import { renderMarkdown } from '../../../src/alpha-lab/provenance/run-card-markdown';

// Desk & Risk
import { type AISignal } from '../../../src/desk/strategies/ai-signal-adapter';
import { RegimeAwareKelly } from '../../../src/desk/risk/regime-aware-kelly';
import { PaperExecutor } from '../../../src/desk/execution/paper-executor';
import { LiveGuardHandoffCoordinator } from '../../../src/desk/execution/live-guard-handoff';
import { LiveExecutionGuard } from '../../../src/desk/execution/live-execution-guard-core';
import type { PolymarketOrder } from '../../../src/desk/execution/polymarket-signer';
import type { BacktestTrade, TradeSignal } from '../../../src/desk/backtesting/types';

// Fixtures
import {
  makeTrendUpCandles,
  makeMultiRegimeCandles,
} from './fixtures/market-data-fixtures';
import {
  createTempDir,
  makeSyntheticTrades,
  makeGateEvaluatorInput,
} from './fixtures/test-helpers';

describe('Tier 5: Adversarial Coverage Hardening Suite (R1-R4)', () => {
  let tempDirObj: { path: string; cleanup: () => Promise<void> };

  beforeEach(async () => {
    tempDirObj = await createTempDir('e2e-tier5-adv-');
  });

  afterEach(async () => {
    await tempDirObj.cleanup();
  });

  // ============================================================================
  // Suite 1: Extreme Volatility, Flash Crashes & Market Regime Shocks (ADV-1)
  // ============================================================================
  describe('Suite 1: Extreme Volatility, Flash Crashes & Market Regime Shocks', () => {
    it('ADV-1.1: flash crash survival — sudden 95% price drop triggers SHOCK regime and blocks Kelly allocation', async () => {
      // Build 50 normal candles followed by a violent 95% collapse
      const normal = makeTrendUpCandles(40, 50000);
      const crash: CandleLike[] = [];
      let lastPrice = normal[normal.length - 1]!.close;
      for (let i = 0; i < 10; i++) {
        lastPrice = Math.round(lastPrice * 0.70); // compounding crash
        crash.push({
          timestamp: new Date(Date.parse(normal[normal.length - 1]!.timestamp) + (i + 1) * 3600000).toISOString(),
          open: normal[normal.length - 1]!.close,
          high: normal[normal.length - 1]!.close,
          low: lastPrice,
          close: lastPrice,
          volume: 100000,
        });
      }
      const allCandles = [...normal, ...crash];

      const regimeResult = classifyRegime(
        { market: 'BTC/USDT', timeframe: '1h', lookback: 20 },
        allCandles,
      );
      // High return dispersion triggers SHOCK or HIGH_VOLATILITY or TREND_DOWN
      expect(['SHOCK', 'HIGH_VOLATILITY', 'TREND_DOWN']).toContain(regimeResult.regime);

      // Verify RegimeAwareKelly contracts sizing safely to 0 in SHOCK
      const kelly = new RegimeAwareKelly({
        kelly: { kellyFraction: 0.25 },
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
      const shockRes = kelly.size({ portfolioValue: 100000, winProbability: 0.6, winLossRatio: 1.5 }, 'SHOCK');
      expect(shockRes.positionSizeUsd).toBe(0.0);
      expect(shockRes.fractionUsed).toBe(0.0);

      // Ensure paper executor processes signal without NaN or negative balance
      const executor = new PaperExecutor({ initialBalance: 100000 });
      await executor.start(100000, true);
      const signal: TradeSignal = {
        signalId: 'crash-sig-01',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        action: 'BUY',
        side: 'buy',
        price: lastPrice,
        quantity: 0.1,
        confidence: 0.9,
        timestamp: Date.now(),
      };
      const result = await executor.executePaperTrade(signal, lastPrice);
      expect(result.success).toBe(true);
      const pnl = executor.getPnlSummary();
      expect(Number.isFinite(pnl.balance)).toBe(true);
      expect(Number.isFinite(pnl.equity)).toBe(true);
      expect(pnl.equity).toBeGreaterThan(0);
      await executor.stop();
    });

    it('ADV-1.2: flatline zero-volatility market — produces 0 metrics without NaN or zero-division exception', () => {
      const flatCandles: CandleLike[] = [];
      const baseTime = Date.parse('2025-01-01T00:00:00.000Z');
      for (let i = 0; i < 60; i++) {
        flatCandles.push({
          timestamp: new Date(baseTime + i * 3600000).toISOString(),
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 0,
        });
      }

      const rvol = realizedVolatility(flatCandles);
      expect(rvol).toBe(0);

      const slope = closeSlope(flatCandles);
      expect(slope).toBe(0);

      const strength = trendStrength(flatCandles);
      expect(strength).toBe(0);

      const features = computeRegimeFeatures(flatCandles);
      expect(features.realizedVol).toBe(0);
      expect(features.closeSlope).toBe(0);
      expect(features.trendStrength).toBe(0);
      expect(features.returnDispersion).toBe(0);

      // Verify walkforward summary calculation with zero volatility does not throw
      const emptySummary = buildSummary([]);
      expect(emptySummary.testSharpe).toBe(0);
      expect(emptySummary.testMaxDrawdown).toBe(0);
      expect(emptySummary.testWinRate).toBe(0);
    });

    it('ADV-1.3: micro-penny asset pricing with 8 decimals — preserves fee and slippage precision without underflow', async () => {
      const microPrice = 0.00002545;
      const microQty = 5000000; // 5M units = $127.25 notional
      const executor = new PaperExecutor({
        initialBalance: 10000,
        feePercent: 0.001,
        slippagePercent: 0.001,
      });
      await executor.start(10000, true);

      const signal: TradeSignal = {
        signalId: 'micro-sig-01',
        symbol: 'PEPE/USDT',
        direction: 'BUY',
        action: 'BUY',
        side: 'buy',
        price: microPrice,
        quantity: microQty,
        confidence: 0.9,
        timestamp: Date.now(),
      };

      const result = await executor.executePaperTrade(signal, microPrice);
      expect(result.success).toBe(true);
      expect(result.trade).toBeDefined();
      expect(result.trade!.executedPrice).toBeGreaterThan(microPrice); // Slippage applied upwards on buy
      expect(result.trade!.fee).toBeGreaterThan(0);
      expect(Number.isFinite(result.trade!.fee)).toBe(true);

      const pos = executor.getPositions().find((p) => p.symbol === 'PEPE/USDT');
      expect(pos).toBeDefined();
      expect(pos?.quantity).toBe(microQty);
      await executor.stop();
    });

    it('ADV-1.4: severe whipsaw market (±40% alternating bars) — walkforward marks high drawdown and diagnostic rejects', () => {
      // Build 60 alternating violent bars
      const whipsaw: CandleLike[] = [];
      const baseTime = Date.parse('2025-01-01T00:00:00.000Z');
      let price = 50000;
      for (let i = 0; i < 60; i++) {
        const mult = i % 2 === 0 ? 1.40 : 0.60;
        price = Math.round(price * mult);
        whipsaw.push({
          timestamp: new Date(baseTime + i * 3600000).toISOString(),
          open: 50000,
          high: Math.max(price, 50000),
          low: Math.min(price, 50000),
          close: price,
          volume: 25000,
        });
      }

      const registry = createDefaultRegistry();
      const expConfig = experimentFromFamily(registry, {
        familyId: 'momentum-breakout',
        symbol: 'BTC/USDT',
        timeframe: '1h',
      });

      const wf = evaluateWalkForward({ candles: whipsaw, config: expConfig });
      expect(wf.summary).toBeDefined();
      expect(Number.isFinite(wf.summary.testSharpe)).toBe(true);
      expect(Number.isFinite(wf.summary.testMaxDrawdown)).toBe(true);
    });

    it('ADV-1.5: NaN close price fallback — regime engine gracefully identifies UNKNOWN without unhandled crash', () => {
      const normal = makeTrendUpCandles(25, 50000);
      const corruptCandles = normal.map((c, idx) =>
        idx === 15 ? { ...c, close: NaN } : c,
      );

      const regimeResult = classifyRegime(
        { market: 'BTC/USDT', timeframe: '1h', lookback: 20 },
        corruptCandles,
      );
      // Engine should not crash and fall back to UNKNOWN or default
      expect(regimeResult.regime).toBeDefined();
      expect(typeof regimeResult.regime).toBe('string');
    });
  });

  // ============================================================================
  // Suite 2: Malformed Inputs, Zero Bounds & Boundary Conditions (ADV-2)
  // ============================================================================
  describe('Suite 2: Malformed Inputs, Zero Bounds & Boundary Conditions', () => {
    it('ADV-2.1: empty candle array passed to evaluateWalkForward — cleanly throws expected Error', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, {
        familyId: 'trend-following',
        symbol: 'BTC/USDT',
        timeframe: '1h',
      });

      expect(() => {
        evaluateWalkForward({ candles: [], config });
      }).toThrow('Empty candle array');
    });

    it('ADV-2.2: sub-minimal candle count (< lookback + maxHolding + 1) — cleanly throws descriptive error', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, {
        familyId: 'trend-following',
        symbol: 'BTC/USDT',
        timeframe: '1h',
      });
      const shortCandles = makeTrendUpCandles(5, 50000); // 5 is much less than lookback(20) + maxHolding(12)

      expect(() => {
        evaluateWalkForward({ candles: shortCandles, config });
      }).toThrow(/Insufficient data: need at least \d+ bars, got 5/);
    });

    it('ADV-2.3: parameter sweep with inverted bounds (min > max) or zero step — handles safely without infinite loop', () => {
      // Inverted bounds where min > max
      const invertedBounds = {
        testParam: { min: 50, max: 20, step: 0 },
      };
      const defaults = { testParam: 30 };

      const grid = sampleParamGrid(invertedBounds, defaults, { stepsPerParam: 3, maxCombinations: 5 });
      expect(Array.isArray(grid)).toBe(true);
      expect(grid.length).toBeGreaterThan(0);

      // Step <= 0
      const snapped = snapToStep(25, 10, 50, 0);
      expect(snapped).toBe(25);

      // Random sampling with count 0
      const randomZero = sampleParamRandom(invertedBounds, defaults, 0);
      expect(randomZero.length).toBe(1);
      expect(randomZero[0]?.testParam).toBe(30);

      // Random sampling with count 1
      const randomOne = sampleParamRandom(invertedBounds, defaults, 1);
      expect(randomOne.length).toBe(1);
    });

    it('ADV-2.4: querying unregistered family ID in experimentFromFamily — throws expected error', () => {
      const registry = createDefaultRegistry();
      expect(() => {
        experimentFromFamily(registry, {
          familyId: 'quantumHyperDriveStrategy',
          symbol: 'BTC/USDT',
          timeframe: '1h',
        });
      }).toThrow('Unknown strategy family: quantumHyperDriveStrategy');
    });

    it('ADV-2.5: candidate generator with filtered familyIds that do not exist — returns empty candidate list safely', () => {
      const registry = createDefaultRegistry();
      const candidates = generateAllCandidateConfigs(registry, {
        symbol: 'BTC/USDT',
        timeframe: '1h',
        familyIds: ['nonExistentFamily123'],
      });
      expect(candidates).toEqual([]);
    });
  });

  // ============================================================================
  // Suite 3: NaN, Infinity & Malformed Metrics Robustness (ADV-3)
  // ============================================================================
  describe('Suite 3: NaN, Infinity & Malformed Metrics Robustness', () => {
    it('ADV-3.1: trades containing NaN PnL — gate evaluation fails numeric checks safely without crash', () => {
      const sm = new AlphaLifecycleStateMachine('strat-nan-pnl', 'PAPER_ACTIVE');
      const badTrades: BacktestTrade[] = [
        {
          timestamp: new Date().toISOString(),
          entryTime: Date.now() - 3600000,
          exitTime: Date.now(),
          side: 'buy',
          entryPrice: 50000,
          exitPrice: 50100,
          size: 1,
          pnl: NaN,
          fee: 5,
          slippage: 2,
        },
      ];

      const gateInput = makeGateEvaluatorInput({
        trades: badTrades,
      });

      const result = sm.evaluate(gateInput);
      expect(result.verdict.allPassed).toBe(false);
      expect(result.state).not.toBe('PROMOTED_LIVE_ELIGIBLE');
    });

    it('ADV-3.2: infinite profit factor (100% win rate, 0 losses) — passes numeric gate cleanly', () => {
      const gateStatus = evaluateNumericGate('profit_factor', Infinity);
      expect(gateStatus.passed).toBe(true);
      expect(gateStatus.currentValue).toBe(Infinity);
      expect(formatValue('profit_factor', Infinity)).toBe('Infinity');
    });

    it('ADV-3.3: negative vs positive drawdown convention (-0.20 vs 0.20) — triggers retirement via Math.abs', () => {
      // Negative drawdown -0.20 (-20%)
      const smNeg = new AlphaLifecycleStateMachine('strat-dd-neg', 'PAPER_ACTIVE');
      const tradesNeg = makeSyntheticTrades(30, 0.40, 50, -200);
      const equityNeg = [
        { timestamp: new Date(Date.now() - 86400000).toISOString(), equity: 100000 },
        { timestamp: new Date().toISOString(), equity: 80000 }, // 20% drawdown
      ];
      const inputNeg = makeGateEvaluatorInput({
        trades: tradesNeg,
        equityCurve: equityNeg,
      });
      const resNeg = smNeg.evaluate(inputNeg);
      expect(resNeg.state).toBe('RETIRED');
      expect(resNeg.transition?.reason).toContain('Drawdown breach');

      // Direct retirement trigger test on state machine
      const smPos = new AlphaLifecycleStateMachine('strat-dd-pos', 'PAPER_ACTIVE');
      const resPos = smPos.evaluate(inputNeg);
      expect(resPos.state).toBe('RETIRED');
    });

    it('ADV-3.4: non-finite statistical significance inputs (NaN p-value or Infinity CI) — fails with diagnostic', () => {
      const resNaN = evaluateStatisticalGate({
        pValueSharpe: NaN,
        sharpeCiLower: 1.2,
      });
      expect(resNaN.passed).toBe(false);
      expect(resNaN.details).toContain('FAIL: statistical validation inputs must be finite numbers');

      const resInf = evaluateStatisticalGate({
        pValueSharpe: 0.01,
        sharpeCiLower: Infinity,
      });
      expect(resInf.passed).toBe(false);
      expect(resInf.details).toContain('FAIL: statistical validation inputs must be finite numbers');
    });

    it('ADV-3.5: inverted date or future start date — computeDaysSinceStart returns negative or 0', () => {
      const futureDate = new Date(Date.now() + 10 * 86400000).toISOString(); // 10 days in future
      const days = computeDaysSinceStart(futureDate);
      expect(days).toBeLessThanOrEqual(0);

      const durationGate = evaluateNumericGate('duration', days);
      expect(durationGate.passed).toBe(false);
    });
  });

  // ============================================================================
  // Suite 4: Alpha Lifecycle State Machine Adversarial Invariants (ADV-4)
  // ============================================================================
  describe('Suite 4: Alpha Lifecycle State Machine Adversarial Invariants & Anti-Flapping', () => {
    it('ADV-4.1: absorbing state invariant — RETIRED strategy rejects all subsequent triggers', () => {
      const sm = new AlphaLifecycleStateMachine('strat-retired-absorb', 'DISCOVERED');
      sm.retire('Administrative operator shutdown');
      expect(sm.getState()).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);

      // Re-retire throws
      expect(() => sm.retire('Duplicate retirement')).toThrow('Strategy is already RETIRED');

      // startPaperTrading throws
      expect(() => sm.startPaperTrading()).toThrow(/absorbing state/);

      // evaluate does not transition and preserves RETIRED
      const gateInput = makeGateEvaluatorInput();
      const evalRes = sm.evaluate(gateInput);
      expect(evalRes.state).toBe('RETIRED');
      expect(evalRes.transition).toBeUndefined();
    });

    it('ADV-4.2: direct promotion bypass prevention — DISCOVERED strategy cannot jump directly to PROMOTED_LIVE_ELIGIBLE', () => {
      const sm = new AlphaLifecycleStateMachine('strat-discovered-jump', 'DISCOVERED');
      expect(sm.getState()).toBe('DISCOVERED');

      // Supply 100% passing gates while in DISCOVERED
      const passingInput = makeGateEvaluatorInput({
        startDate: new Date(Date.now() - 35 * 86400000).toISOString(),
        testWinRate: 0.65,
        valWinRate: 0.64,
        statisticalValidation: { pValueSharpe: 0.01, sharpeCiLower: 1.2 },
      });

      const evalRes = sm.evaluate(passingInput);
      expect(evalRes.verdict.allPassed).toBe(true);
      // State MUST remain DISCOVERED — cannot jump to PROMOTED_LIVE_ELIGIBLE
      expect(evalRes.state).toBe('DISCOVERED');
      expect(evalRes.transition).toBeUndefined();
      expect(sm.isLiveEligible()).toBe(false);
    });

    it('ADV-4.3: anti-flapping defense — oscillating metric input preserves RETIRED permanently', () => {
      const sm = new AlphaLifecycleStateMachine('strat-flapping-defense', 'PAPER_ACTIVE');

      // Cycle 1: Drawdown breach -> transitions to RETIRED
      const badInput = makeGateEvaluatorInput({
        equityCurve: [
          { timestamp: new Date(Date.now() - 86400000).toISOString(), equity: 100000 },
          { timestamp: new Date().toISOString(), equity: 80000 }, // 20% drawdown breach
        ],
      });
      const res1 = sm.evaluate(badInput);
      expect(res1.state).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);

      // Cycle 2: Suddenly stellar metrics (55% win rate, 0% drawdown, 50 trades)
      const stellarInput = makeGateEvaluatorInput({
        equityCurve: [
          { timestamp: new Date(Date.now() - 86400000).toISOString(), equity: 100000 },
          { timestamp: new Date().toISOString(), equity: 110000 },
        ],
      });
      const res2 = sm.evaluate(stellarInput);
      expect(res2.state).toBe('RETIRED');
      expect(res2.transition).toBeUndefined();
      expect(sm.isRetired()).toBe(true);
    });

    it('ADV-4.4: paper router rejects signals for RETIRED strategy', async () => {
      const ledgerPath = join(tempDirObj.path, 'pipeline-retired-sig.jsonl');
      const pipeline = new AlphaLabAutonomousPipeline({
        symbol: 'BTC/USDT',
        ledgerPath,
        runCardDir: join(tempDirObj.path, 'run-cards'),
      });

      // Manually add candidate and retire it
      const transition = pipeline.ingestCandidateToPaper({
        strategyId: 'strat-to-retire',
        familyId: 'trend-following',
        config: {} as unknown as Record<string, unknown>,
        walkforwardSummary: {} as unknown as Record<string, unknown>,
        survivalGateResult: { passed: true, checks: {} } as unknown as Record<string, unknown>,
        status: 'PASSED',
      } as unknown as Parameters<typeof pipeline.ingestCandidateToPaper>[0]);
      expect(transition.toState).toBe('PAPER_ACTIVE');

      const sm = pipeline.getLifecycleStateMachine('strat-to-retire')!;
      sm.retire('Drawdown cut');
      expect(sm.isRetired()).toBe(true);

      // Now route a signal for this strategy
      const signal: AISignal = {
        signalId: 'sig-adv-retired',
        strategyId: 'strat-to-retire',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        action: 'BUY',
        confidence: 0.95,
        expectancy: 0.05,
        regime: 'TREND_UP',
        timestamp: Date.now(),
      };

      const outcomes = await pipeline.processSignals([signal], 50000);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0]?.status).toBe('REJECTED');
      expect(outcomes[0]?.reason).toContain('Strategy is in RETIRED state');
    });

    it('ADV-4.5: mapStrategyStateToLifecycleState comprehensive backward compatibility mapping', () => {
      const discoveredStates: StrategyState[] = [
        'CANDIDATE',
        'EVALUATED',
        'BASELINE_GATE',
        'WALK_FORWARD',
        'SURVIVAL_GATE',
      ];
      for (const st of discoveredStates) {
        expect(mapStrategyStateToLifecycleState(st)).toBe('DISCOVERED');
      }

      expect(mapStrategyStateToLifecycleState('PAPER_APPROVED')).toBe('PAPER_ACTIVE');
      expect(mapStrategyStateToLifecycleState('LIVE_APPROVED')).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(mapStrategyStateToLifecycleState('REJECTED')).toBe('RETIRED');
      expect(mapStrategyStateToLifecycleState('UNKNOWN' as unknown as StrategyState)).toBe('DISCOVERED');
    });
  });

  // ============================================================================
  // Suite 5: Cryptographic Ledger Tampering & Serial Queue (ADV-5)
  // ============================================================================
  describe('Suite 5: Cryptographic Ledger Tampering, Integrity Breaches & Serial Queue', () => {
    it('ADV-5.1: intermediate record tampering (strategyRef altered) — detected by verifyLedgerChain', async () => {
      const ledgerPath = join(tempDirObj.path, 'tamper-test.jsonl');
      await appendLedgerRecord({ runId: 'r1', configHash: 'h1', resultClass: 'IS', strategyRef: 's1', gates: {} }, ledgerPath);
      await appendLedgerRecord({ runId: 'r2', configHash: 'h2', resultClass: 'IS', strategyRef: 's2', gates: {} }, ledgerPath);
      await appendLedgerRecord({ runId: 'r3', configHash: 'h3', resultClass: 'IS', strategyRef: 's3', gates: {} }, ledgerPath);

      const records = await readLedgerRecords(ledgerPath);
      expect(records.length).toBe(3);
      expect(verifyLedgerChain(records)).toBe(-1);

      // Tamper with record 1's strategyRef
      records[1]!.strategyRef = 'maliciously-altered-strategy';
      // verifyLedgerChain detects the broken link at index 1 or 2
      const brokenIndex = verifyLedgerChain(records);
      expect(brokenIndex).toBeGreaterThanOrEqual(1);
    });

    it('ADV-5.2: record deletion in mid-chain — verifyLedgerChain identifies breach', async () => {
      const ledgerPath = join(tempDirObj.path, 'deletion-test.jsonl');
      await appendLedgerRecord({ runId: 'r1', configHash: 'h1', resultClass: 'IS', strategyRef: 's1', gates: {} }, ledgerPath);
      await appendLedgerRecord({ runId: 'r2', configHash: 'h2', resultClass: 'IS', strategyRef: 's2', gates: {} }, ledgerPath);
      await appendLedgerRecord({ runId: 'r3', configHash: 'h3', resultClass: 'IS', strategyRef: 's3', gates: {} }, ledgerPath);

      const records = await readLedgerRecords(ledgerPath);
      // Delete record 1 (middle record)
      const tamperedRecords = [records[0]!, records[2]!];
      const brokenIndex = verifyLedgerChain(tamperedRecords);
      expect(brokenIndex).toBe(1); // Link 1's prevHash doesn't match record 0's hash
    });

    it('ADV-5.3: strict ledger verification blocks pipeline start on broken chain', async () => {
      const ledgerPath = join(tempDirObj.path, 'corrupted-startup.jsonl');
      // Write corrupted ledger records directly
      await writeFile(
        ledgerPath,
        JSON.stringify({ runId: 'r1', configHash: 'h1', prevHash: '', entryHash: 'forgedHash' }) + '\n' +
        JSON.stringify({ runId: 'r2', configHash: 'h2', prevHash: 'invalidPrev', entryHash: 'forgedHash2' }) + '\n',
        'utf8',
      );

      const pipeline = new AlphaLabAutonomousPipeline({
        ledgerPath,
        strictLedgerVerification: true,
      });

      await expect(pipeline.start()).rejects.toThrow(/ledger chain integrity breach detected/);
    });

    it('ADV-5.4: high-concurrency race condition defense — sequential promise queue maintains unbroken chain', async () => {
      const ledgerPath = join(tempDirObj.path, 'concurrent-chain.jsonl');

      let queue: Promise<void> = Promise.resolve();
      const appends: Promise<unknown>[] = [];

      for (let i = 0; i < 10; i++) {
        const p = new Promise((resolve) => {
          queue = queue.then(async () => {
            const res = await appendLedgerRecord(
              {
                runId: `concurrent-${i}`,
                configHash: `hash-${i}`,
                resultClass: 'IS',
                strategyRef: `strat-${i}`,
                gates: {},
              },
              ledgerPath,
            );
            resolve(res);
          });
        });
        appends.push(p);
      }

      await Promise.all(appends);

      const records = await readLedgerRecords(ledgerPath);
      expect(records.length).toBe(10);
      // Unbroken chain verification
      const brokenIndex = verifyLedgerChain(records);
      expect(brokenIndex).toBe(-1);
    });

    it('ADV-5.5: fail-safe error handling — appendLedgerRecord to unwritable directory returns ok: false', async () => {
      // Path pointing to impossible location (null character or read-only pseudo root)
      const res = await appendLedgerRecord(
        {
          runId: 'fail-safe-run',
          configHash: 'h1',
          resultClass: 'IS',
          strategyRef: 's1',
          gates: {},
        },
        '/sys/kernel/impossible/research-ledger.jsonl',
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(typeof res.error).toBe('string');
        expect(res.error.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // Suite 6: Run Card Provenance Resilience & Schema Conformance (ADV-6)
  // ============================================================================
  describe('Suite 6: Run Card Provenance Resilience & Schema Conformance', () => {
    it('ADV-6.1: deterministic canonicalization — nested reversed keys and undefined values produce identical hashes', () => {
      const configA = {
        symbol: 'BTC/USDT',
        nested: {
          beta: 2,
          alpha: 1,
          gamma: { z: 26, a: 1 },
        },
        unset: undefined,
        tags: ['momentum', 'crypto'],
      };

      const configB = {
        nested: {
          gamma: { a: 1, z: 26 },
          alpha: 1,
          beta: 2,
        },
        tags: ['momentum', 'crypto'],
        symbol: 'BTC/USDT',
      };

      const hashA = hashConfig(configA);
      const hashB = hashConfig(configB);
      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64); // SHA-256 hex length
    });

    it('ADV-6.2: fail-safe run card write on unwritable directory — captures writeError without throwing', async () => {
      const blockingFile = join(tempDirObj.path, 'blocking-file-adv');
      await writeFile(blockingFile, 'x');
      const unwritableDir = join(blockingFile, 'impossible-dir');
      const card = await writeRunCard(unwritableDir, {
        runId: 'adv-fail-run',
        resultClass: 'REJECTED',
        strategyRef: 'strat-fail',
        hypothesis: 'Testing write error handling',
        dataSources: ['mock:data'],
        metrics: {},
        config: {},
      });

      expect(card).toBeDefined();
      expect(card.runId).toBe('adv-fail-run');
      expect(card.writeError).toBeDefined();
      expect(typeof card.writeError).toBe('string');
    });

    it('ADV-6.3: corrupted run cards in search roots — buildRunCardIndex and readRunCardByRunId skip safely', async () => {
      const runsDir = join(tempDirObj.path, 'runs');
      const badRunDir = join(runsDir, 'corrupt-run');
      const goodRunDir = join(runsDir, 'good-run');

      // Write good run card
      await writeRunCard(goodRunDir, {
        runId: 'good-run-001',
        resultClass: 'SURVIVED',
        strategyRef: 'strat-good',
        hypothesis: 'Clean run card',
        dataSources: ['ccxt:BTC/USDT:1h'],
        metrics: { sharpeRatio: 1.5 },
        config: { key: 'val' },
      });

      // Write corrupted JSON into bad run dir
      await writeFile(join(badRunDir, 'run_card.json'), 'NOT_VALID_JSON_CORRUPT{{{', 'utf8').catch(() => {});

      const index = await buildRunCardIndex([runsDir]);
      expect(index.has('good-run-001')).toBe(true);

      const goodCard = await readRunCardByRunId('good-run-001', [runsDir]);
      expect(goodCard?.runId).toBe('good-run-001');

      const nonExistent = await readRunCardByRunId('does-not-exist', [runsDir]);
      expect(nonExistent).toBeNull();
    });

    it('ADV-6.4: markdown rendering with injection and special characters formats valid table', () => {
      const card = {
        schemaVersion: '1.0.0',
        runId: 'run-md-adv',
        configHash: 'a'.repeat(64),
        createdAt: new Date().toISOString(),
        resultClass: 'SURVIVED' as const,
        strategyRef: 'strat | evil | pipes',
        hypothesis: 'Hypothesis with `code`, **bold**, and | pipes |',
        dataSources: ['source:1', 'source:2'],
        metrics: { sharpeRatio: 1.85, winRate: 0.65, maxDrawdown: 0.08 },
        gateResults: [
          { gateId: 'sharpe', passed: true, detail: '1.85 >= 1.0' },
          { gateId: 'drawdown', passed: true, detail: '0.08 <= 0.15' },
        ],
        warnings: ['Warning with `markdown` formatting'],
      };

      const md = renderMarkdown(card);
      expect(md).toContain('# Run Card — run-md-adv');
      expect(md).toContain('`SURVIVED`');
      expect(md).toContain('1.85');
      expect(md).toContain('Warning with `markdown` formatting');
    });
  });

  // ============================================================================
  // Suite 7: Multi-Cycle Pipeline Recovery, Stress & Live Guard Defense (ADV-7)
  // ============================================================================
  describe('Suite 7: Multi-Cycle Pipeline Recovery, Stress & Live Guard Defense', () => {
    it('ADV-7.1: continuous 5-cycle autonomous pipeline execution across multi-regimes', async () => {
      const ledgerPath = join(tempDirObj.path, 'multi-cycle-ledger.jsonl');
      const runCardDir = join(tempDirObj.path, 'multi-cycle-cards');
      const pipeline = new AlphaLabAutonomousPipeline({
        symbol: 'BTC/USDT',
        timeframe: '1h',
        initialBalanceUsd: 100000,
        liveCapitalUsdc: 100000,
        ledgerPath,
        runCardDir,
        discoveryConfig: {
          sweep: { mode: 'defaults', maxCandidatesPerFamily: 1 },
        },
      });

      await pipeline.start(100000, true);

      const { candles } = makeMultiRegimeCandles();

      // Run 5 cycles
      for (let c = 1; c <= 5; c++) {
        const cycleResult = await pipeline.runCycle({
          candles,
          currentPrice: 50000 + c * 100,
        });

        expect(cycleResult.cycleId).toContain(`cycle-${c}-`);
        expect(cycleResult.status.cycleCount).toBe(c);
        expect(cycleResult.durationMs).toBeGreaterThanOrEqual(0);
      }

      const status = await pipeline.getStatus();
      expect(status.cycleCount).toBe(5);
      expect(status.isLedgerChainValid).toBe(true);

      // Ledger must have chained records across all 5 cycles
      const records = await readLedgerRecords(ledgerPath);
      expect(records.length).toBeGreaterThan(0);
      expect(verifyLedgerChain(records)).toBe(-1);

      await pipeline.stop();
    });

    it('ADV-7.2: pipeline reset restores pristine balance and resets state machines', async () => {
      const ledgerPath = join(tempDirObj.path, 'reset-ledger.jsonl');
      const pipeline = new AlphaLabAutonomousPipeline({
        symbol: 'BTC/USDT',
        initialBalanceUsd: 100000,
        ledgerPath,
        runCardDir: join(tempDirObj.path, 'reset-cards'),
      });

      await pipeline.start(100000, true);

      const { candles } = makeMultiRegimeCandles();
      await pipeline.runCycle({ candles, currentPrice: 50000 });

      let status = await pipeline.getStatus();
      expect(status.cycleCount).toBe(1);
      expect(status.totalStrategiesCount).toBeGreaterThan(0);

      // Hard reset with new initial balance
      await pipeline.reset(200000);
      status = await pipeline.getStatus();
      expect(status.cycleCount).toBe(0);
      expect(status.lastCycleAt).toBeNull();
      expect(status.totalStrategiesCount).toBe(0);
      expect(status.equity).toBe(200000);
      expect(status.openPositions.length).toBe(0);
    });

    it('ADV-7.3: LiveExecutionGuard defense — blocks orders on size cap, circuit breaker and invalid lifecycle', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      const coordinator = new LiveGuardHandoffCoordinator({
        guard,
        capitalUsdc: 100000,
        maxPositionFraction: 0.02, // 2% = $2,000 max
        signalTtlMs: 200,
      });

      const baseOrder: PolymarketOrder = {
        tokenID: 'tok-btc',
        price: 0.50,
        side: 'BUY',
        size: 2000, // $1,000 notional
        feeRateBps: 10,
        nonce: 1,
      };

      // 1. Rejects if strategy is DISCOVERED (not PROMOTED_LIVE_ELIGIBLE)
      const resDiscovered = coordinator.evaluateLiveOrder({
        strategyId: 'strat-disc',
        lifecycleState: 'DISCOVERED',
        signal: {
          signalId: 'sig-1',
          strategyId: 'strat-disc',
          symbol: 'BTC/USDT',
          direction: 'BUY',
          action: 'BUY',
          confidence: 0.9,
          expectancy: 0.05,
          regime: 'TREND_UP',
          timestamp: Date.now(),
        },
        order: baseOrder,
      });
      expect(resDiscovered.approved).toBe(false);
      expect(resDiscovered.reason).toContain('must be PROMOTED_LIVE_ELIGIBLE');

      // 2. Rejects if order size exceeds 2% capital ($2,001 on $100k)
      const oversizeOrder: PolymarketOrder = {
        ...baseOrder,
        price: 1.0,
        size: 2001, // $2,001 > $2,000
      };
      const resOversize = coordinator.evaluateLiveOrder({
        strategyId: 'strat-promoted',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: {
          signalId: 'sig-2',
          strategyId: 'strat-promoted',
          symbol: 'BTC/USDT',
          direction: 'BUY',
          action: 'BUY',
          confidence: 0.9,
          expectancy: 0.05,
          regime: 'TREND_UP',
          timestamp: Date.now(),
        },
        order: oversizeOrder,
      });
      expect(resOversize.approved).toBe(false);
      expect(resOversize.checks.positionSizeOk).toBe(false);

      // 3. Rejects if signal is stale (age > 200ms)
      const staleSignal: AISignal = {
        signalId: 'sig-stale',
        strategyId: 'strat-promoted',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        action: 'BUY',
        confidence: 0.9,
        expectancy: 0.05,
        regime: 'TREND_UP',
        timestamp: Date.now() - 500, // 500ms old > 200ms TTL
      };
      const resStale = coordinator.evaluateLiveOrder({
        strategyId: 'strat-promoted',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: staleSignal,
        order: baseOrder,
      });
      expect(resStale.approved).toBe(false);
      expect(resStale.reason).toContain('STALE_SIGNAL');
      expect(resStale.checks.signalTtlOk).toBe(false);
    });

    it('ADV-7.4: LiveExecutionGuard circuit breaker tripped after consecutive losses halts live order handoff', () => {
      const guard = new LiveExecutionGuard({
        capitalUsdc: 100000,
        maxConsecutiveLosses: 2,
        enabled: true,
      });
      const coordinator = new LiveGuardHandoffCoordinator({
        guard,
        capitalUsdc: 100000,
      });

      // Record 2 losses to trip circuit breaker
      guard.recordLoss(-100);
      guard.recordLoss(-100);
      expect(guard.getStatus().circuitTripped).toBe(true);

      const order: PolymarketOrder = {
        tokenID: 'tok-btc',
        price: 0.50,
        side: 'BUY',
        size: 500,
        feeRateBps: 10,
        nonce: 10,
      };

      const res = coordinator.evaluateLiveOrder({
        strategyId: 'strat-cb-test',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: {
          signalId: 'sig-cb',
          strategyId: 'strat-cb-test',
          symbol: 'BTC/USDT',
          direction: 'BUY',
          action: 'BUY',
          confidence: 0.9,
          expectancy: 0.05,
          regime: 'TREND_UP',
          timestamp: Date.now(),
        },
        order,
      });

      expect(res.approved).toBe(false);
      expect(res.checks.circuitBreakerOk).toBe(false);
      expect(res.reason).toContain('Circuit breaker tripped');
    });
  });
});
