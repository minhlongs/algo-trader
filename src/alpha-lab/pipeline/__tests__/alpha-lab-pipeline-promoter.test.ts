import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ingestCandidateToPaperStateMachine,
  routeCandidateSignals,
  evaluateActivePaperPromotions,
  evaluateLiveRiskHandoff,
} from '../alpha-lab-pipeline-promoter';
import { AlphaLifecycleStateMachine } from '../../attribution/alpha-lifecycle-state-machine';
import type { DiscoveredAlphaCandidate } from '../../alpha-discovery/continuous-discovery-pipeline';
import type { AISignal } from '../../../desk/strategies/ai-signal-adapter';
import type { AISignalPaperRouter, SignalRoutingOutcome } from '../../../desk/strategies/ai-signal-paper-router';
import type { LiveGuardHandoffCoordinator } from '../../../desk/execution/live-guard-handoff';
import type { PolymarketOrder } from '../../../desk/execution/polymarket-signer';

describe('Alpha-Lab Pipeline Promoter & Quarantine Circuit Breaker Routing', () => {
  let stateMachines: Map<string, AlphaLifecycleStateMachine>;
  let candidateConfigs: Map<string, Record<string, unknown>>;
  let lastKnownCandidates: Map<string, DiscoveredAlphaCandidate>;
  let mockPaperRouter: AISignalPaperRouter;
  let mockPersistLedger: vi.Mock;

  const createSignal = (strategyId: string, overrides: Partial<AISignal> = {}): AISignal => ({
    signalId: `sig-${strategyId}-${Date.now()}`,
    strategyId,
    direction: 'BUY',
    action: 'BUY',
    symbol: 'BTC/USDT',
    confidence: 0.85,
    expectancy: 0.04,
    regime: 'TREND_UP',
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    stateMachines = new Map();
    candidateConfigs = new Map();
    lastKnownCandidates = new Map();
    mockPersistLedger = vi.fn().mockResolvedValue({ ok: true, entryHash: 'mock-hash-123' });

    mockPaperRouter = {
      routeSignal: vi.fn().mockImplementation(async (signal: AISignal, marketPrice: number) => ({
        status: 'FILLED' as const,
        signal,
        symbol: signal.symbol ?? 'BTC/USDT',
        marketPrice,
        validation: { valid: true, signal, rejectionReasons: [] },
        timestamp: Date.now(),
      })),
      getEquityCurve: vi.fn().mockReturnValue([]),
      getFillRecords: vi.fn().mockReturnValue([]),
    } as unknown as AISignalPaperRouter;
  });

  describe('Candidate Ingestion into State Machine', () => {
    it('validates passing candidate and transitions to PAPER_ACTIVE', () => {
      const candidate: DiscoveredAlphaCandidate = {
        strategyId: 'strat-alpha-momentum',
        familyId: 'MOMENTUM_TREND',
        config: { lookback: 20 },
        status: 'PASSED',
        survivalGateResult: {
          passed: true,
          evaluatedAt: new Date().toISOString(),
          sharpeRatio: 1.7,
          maxDrawdown: 0.08,
          profitFactor: 1.5,
          dsr: 0.96,
          regimeConsistencyScore: 0.75,
          regimeConsistencyPassed: true,
          costStressPassed: true,
          conservativePnl: 1000,
          adversePnl: 500,
          metrics: {
            oosSharpeRatio: 1.7,
            maxDrawdown: 0.08,
            profitFactor: 1.5,
            dsr: 0.96,
            expectedMaxSharpe: 0.4,
            skewness: 0,
            kurtosis: 3,
            regimeConsistencyScore: 0.75,
            splitConsistencyScore: 0.8,
            conservativeStressPnl: 1000,
            adverseStressPnl: 500,
            conservativeStressSharpe: 1.3,
            adverseStressSharpe: 1.0,
            stressedPnl3x: 400,
            testWinRate: 0.55,
            testProfitFactor: 1.5,
            totalTestTrades: 30,
          },
          checks: {
            sharpePassed: true,
            drawdownPassed: true,
            profitFactorPassed: true,
            dsrPassed: true,
            regimeConsistencyPassed: true,
            costStressPassed: true,
            costStressConservativePassed: true,
            costStressAdversePassed: true,
          },
          gateChecks: {
            sharpePassed: true,
            drawdownPassed: true,
            profitFactorPassed: true,
            dsrPassed: true,
            regimeConsistencyPassed: true,
            costStressPassed: true,
          },
          thresholds: {
            minOosSharpeRatio: 1.5,
            maxDrawdown: 0.12,
            minProfitFactor: 1.25,
            minDsr: 0.95,
            minRegimeConsistencyScore: 0.70,
            costStressMultiplier: 3.0,
            baseFrictionBps: 10,
            conservativeFrictionBps: 20,
            adverseFrictionBps: 50,
            minTestTrades: 5,
          },
          diagnostics: [],
          failures: [],
          rejectionReasons: [],
        },
      };

      const transition = ingestCandidateToPaperStateMachine(
        candidate,
        stateMachines,
        candidateConfigs,
        lastKnownCandidates,
        mockPersistLedger,
      );

      const sm = stateMachines.get('strat-alpha-momentum')!;
      expect(sm).toBeDefined();
      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(sm.isPaperActive()).toBe(true);
      expect(transition.toState).toBe('PAPER_ACTIVE');
      expect(mockPersistLedger).toHaveBeenCalledWith(
        expect.objectContaining({
          lifecycleState: 'PAPER_ACTIVE',
          resultClass: 'PAPER',
        }),
      );
    });
  });

  describe('Circuit Breaker Quarantine Signal Execution Blocking', () => {
    it('immediately blocks signals from QUARANTINED strategy with exact rejection reason', async () => {
      const sm = new AlphaLifecycleStateMachine('strat-quarantined', 'PAPER_ACTIVE');
      sm.checkDrawdownQuarantine(0.10); // Trips circuit breaker -> QUARANTINED
      stateMachines.set('strat-quarantined', sm);

      const signal = createSignal('strat-quarantined');
      const outcomes = await routeCandidateSignals(
        mockPaperRouter,
        stateMachines,
        [signal],
        50_000,
        'BTC/USDT',
      );

      expect(outcomes).toHaveLength(1);
      const outcome = outcomes[0];
      expect(outcome.status).toBe('REJECTED');
      expect(outcome.reason).toBe('Strategy is quarantined by drawdown circuit breaker');
      expect(outcome.validation.valid).toBe(false);
      expect(outcome.validation.rejectionReasons).toContain(
        'Strategy is quarantined by drawdown circuit breaker',
      );
      // PaperRouter was not invoked
      expect(mockPaperRouter.routeSignal).not.toHaveBeenCalled();
    });

    it('blocks signals from RETIRED strategy', async () => {
      const sm = new AlphaLifecycleStateMachine('strat-retired', 'DISCOVERED');
      sm.retire('Drawdown breached maximum safety threshold');
      stateMachines.set('strat-retired', sm);

      const signal = createSignal('strat-retired');
      const outcomes = await routeCandidateSignals(
        mockPaperRouter,
        stateMachines,
        [signal],
        50_000,
        'BTC/USDT',
      );

      expect(outcomes).toHaveLength(1);
      const outcome = outcomes[0];
      expect(outcome.status).toBe('REJECTED');
      expect(outcome.reason).toContain('Strategy is in RETIRED state');
      expect(outcome.validation.valid).toBe(false);
      expect(mockPaperRouter.routeSignal).not.toHaveBeenCalled();
    });

    it('routes signals normally when strategy is in PAPER_ACTIVE or PROMOTED_LIVE_ELIGIBLE', async () => {
      const smActive = new AlphaLifecycleStateMachine('strat-active', 'PAPER_ACTIVE');
      const smPromoted = new AlphaLifecycleStateMachine('strat-promoted', 'PROMOTED_LIVE_ELIGIBLE');
      stateMachines.set('strat-active', smActive);
      stateMachines.set('strat-promoted', smPromoted);

      const signal1 = createSignal('strat-active');
      const signal2 = createSignal('strat-promoted');

      const outcomes = await routeCandidateSignals(
        mockPaperRouter,
        stateMachines,
        [signal1, signal2],
        50_000,
        'BTC/USDT',
      );

      expect(outcomes).toHaveLength(2);
      expect(outcomes[0].status).toBe('FILLED');
      expect(outcomes[1].status).toBe('FILLED');
      expect(mockPaperRouter.routeSignal).toHaveBeenCalledTimes(2);
    });
  });

  describe('Live Risk Handoff Evaluation', () => {
    it('evaluates live order handoff verdict with correct lifecycle state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-promoted-1', 'PROMOTED_LIVE_ELIGIBLE');
      stateMachines.set('strat-promoted-1', sm);

      const mockLiveCoordinator = {
        evaluateLiveOrder: vi.fn().mockReturnValue({
          approved: true,
          evaluatedAt: Date.now(),
          checks: {
            promotionEligible: true,
            signalTtlOk: true,
            rateLimitOk: true,
            drawdownBreakerOk: true,
            circuitBreakerOk: true,
            positionSizeOk: true,
            dailyDrawdownOk: true,
            concurrentLimitOk: true,
          },
        }),
      } as unknown as LiveGuardHandoffCoordinator;

      const order: PolymarketOrder = {
        assetId: '0x123',
        side: 'BUY',
        price: 0.65,
        size: 100,
      };

      const verdict = evaluateLiveRiskHandoff(
        mockLiveCoordinator,
        stateMachines,
        'BTC/USDT',
        { strategyId: 'strat-promoted-1', order },
      );

      expect(verdict.approved).toBe(true);
      expect(mockLiveCoordinator.evaluateLiveOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'strat-promoted-1',
          lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        }),
      );
    });
  });
});
