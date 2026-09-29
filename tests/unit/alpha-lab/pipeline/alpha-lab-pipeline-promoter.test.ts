import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ingestCandidateToPaperStateMachine,
  routeCandidateSignals,
  evaluateActivePaperPromotions,
  evaluateLiveRiskHandoff,
} from '../../../../src/alpha-lab/pipeline/alpha-lab-pipeline-promoter';
import { AlphaLifecycleStateMachine } from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import type { DiscoveredAlphaCandidate } from '../../../../src/alpha-lab/alpha-discovery/continuous-discovery-pipeline';
import type { AISignal } from '../../../../src/desk/strategies/ai-signal-adapter';
import type { AISignalPaperRouter } from '../../../../src/desk/strategies/ai-signal-paper-router';
import type { LiveGuardHandoffCoordinator } from '../../../../src/desk/execution/live-guard-handoff';
import type { PolymarketOrder } from '../../../../src/desk/execution/polymarket-signer';
import type { GateEvaluatorInput } from '../../../../src/alpha-lab/gates/gate-evaluator-types';

describe('Alpha-Lab Pipeline Promoter & Routing', () => {
  let stateMachines: Map<string, AlphaLifecycleStateMachine>;
  let candidateConfigs: Map<string, Record<string, unknown>>;
  let lastKnownCandidates: Map<string, DiscoveredAlphaCandidate>;
  let mockPersistLedger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stateMachines = new Map();
    candidateConfigs = new Map();
    lastKnownCandidates = new Map();
    mockPersistLedger = vi.fn().mockResolvedValue({ success: true, hash: 'test-hash' });
  });

  describe('ingestCandidateToPaperStateMachine', () => {
    it('creates a new state machine and transitions to PAPER_ACTIVE', async () => {
      const candidate: DiscoveredAlphaCandidate = {
        strategyId: 'strat-101',
        familyId: 'momentum-breakout',
        hypothesis: 'Momentum anomaly',
        code: 'console.log("signal")',
        config: { lookback: 20 },
        discoveredAt: new Date().toISOString(),
        generation: 1,
        survivalGateResult: {
          passed: true,
          evaluatedAt: new Date().toISOString(),
          sharpeRatio: 1.9,
          maxDrawdown: 0.08,
          profitFactor: 1.5,
          dsr: 0.98,
          regimeConsistencyScore: 0.8,
          regimeConsistencyPassed: true,
          costStressPassed: true,
          conservativePnl: 1000,
          adversePnl: 500,
          metrics: {} as never,
          checks: { sharpePassed: true } as never,
          gateChecks: {} as never,
          thresholds: {} as never,
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
        'Auto ingestion test',
      );

      expect(transition.fromState).toBe('DISCOVERED');
      expect(transition.toState).toBe('PAPER_ACTIVE');
      expect(stateMachines.has('strat-101')).toBe(true);
      expect(stateMachines.get('strat-101')?.getState()).toBe('PAPER_ACTIVE');
      expect(candidateConfigs.get('strat-101')).toEqual({ lookback: 20 });
      expect(lastKnownCandidates.get('strat-101')).toEqual(candidate);
      expect(mockPersistLedger).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyRef: 'momentum-breakout',
          lifecycleState: 'PAPER_ACTIVE',
        }),
      );
    });

    it('reuses existing state machine and transitions to PAPER_ACTIVE', () => {
      const existingSm = new AlphaLifecycleStateMachine('strat-102', 'VALIDATED');
      stateMachines.set('strat-102', existingSm);

      const candidate: DiscoveredAlphaCandidate = {
        strategyId: 'strat-102',
        hypothesis: 'Mean reversion',
        code: 'console.log("signal")',
        config: { period: 14 },
        discoveredAt: new Date().toISOString(),
        generation: 2,
      };

      const transition = ingestCandidateToPaperStateMachine(
        candidate,
        stateMachines,
        candidateConfigs,
        lastKnownCandidates,
        mockPersistLedger,
      );

      expect(transition.fromState).toBe('VALIDATED');
      expect(transition.toState).toBe('PAPER_ACTIVE');
      expect(existingSm.getState()).toBe('PAPER_ACTIVE');
    });
  });

  describe('routeCandidateSignals', () => {
    let mockPaperRouter: Partial<AISignalPaperRouter>;

    beforeEach(() => {
      mockPaperRouter = {
        routeSignal: vi.fn().mockImplementation(async (signal, marketPrice) => ({
          status: 'EXECUTED',
          signal,
          symbol: signal.symbol ?? 'BTC/USDT',
          marketPrice,
          timestamp: Date.now(),
        })),
      };
    });

    it('routes signals through paperRouter when strategy is PAPER_ACTIVE', async () => {
      const sm = new AlphaLifecycleStateMachine('strat-active', 'PAPER_ACTIVE');
      stateMachines.set('strat-active', sm);

      const signal: AISignal = {
        signalId: 'sig-1',
        strategyId: 'strat-active',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        confidence: 0.85,
        expectancy: 0.04,
        regime: 'TREND_UP',
        timestamp: Date.now(),
      };

      const outcomes = await routeCandidateSignals(
        mockPaperRouter as AISignalPaperRouter,
        stateMachines,
        [signal],
        50000,
        'BTC/USDT',
      );

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe('EXECUTED');
      expect(mockPaperRouter.routeSignal).toHaveBeenCalledWith(signal, 50000, sm);
    });

    it('rejects signals when strategy is QUARANTINED', async () => {
      const sm = new AlphaLifecycleStateMachine('strat-q', 'QUARANTINED');
      stateMachines.set('strat-q', sm);

      const signal: AISignal = {
        signalId: 'sig-2',
        strategyId: 'strat-q',
        symbol: 'ETH/USDT',
        direction: 'BUY',
        confidence: 0.8,
        expectancy: 0.03,
        regime: 'RANGING',
        timestamp: Date.now(),
      };

      const outcomes = await routeCandidateSignals(
        mockPaperRouter as AISignalPaperRouter,
        stateMachines,
        [signal],
        3000,
        'ETH/USDT',
      );

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe('REJECTED');
      expect(outcomes[0].reason).toContain('quarantined by drawdown circuit breaker');
      expect(mockPaperRouter.routeSignal).not.toHaveBeenCalled();
    });

    it('rejects signals when strategy is RETIRED', async () => {
      const sm = new AlphaLifecycleStateMachine('strat-r', 'RETIRED');
      stateMachines.set('strat-r', sm);

      const signal: AISignal = {
        signalId: 'sig-3',
        strategyId: 'strat-r',
        direction: 'SELL',
        confidence: 0.7,
        expectancy: 0.02,
        regime: 'TREND_DOWN',
        timestamp: Date.now(),
      };

      const outcomes = await routeCandidateSignals(
        mockPaperRouter as AISignalPaperRouter,
        stateMachines,
        [signal],
        200,
        'SOL/USDT',
      );

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe('REJECTED');
      expect(outcomes[0].reason).toContain('RETIRED state');
    });
  });

  describe('evaluateActivePaperPromotions', () => {
    it('evaluates and transitions PAPER_ACTIVE strategies with gate inputs', async () => {
      const sm = new AlphaLifecycleStateMachine('strat-promote', 'PAPER_ACTIVE');
      stateMachines.set('strat-promote', sm);
      candidateConfigs.set('strat-promote', { id: 'cfg-1' });

      const gateInput: GateEvaluatorInput = {
        trades: Array.from({ length: 55 }, (_, i) => ({
          id: `t-${i}`,
          strategyId: 'strat-promote',
          symbol: 'BTC/USDT',
          direction: 'BUY',
          entryPrice: 50000,
          exitPrice: 52000,
          size: 1,
          entryTime: 1700000000000 + i * 3600000,
          exitTime: 1700000000000 + i * 3600000 + 1800000,
          pnl: 2000,
          fees: 10,
        })),
        startDate: new Date(Date.now() - 35 * 86400000).toISOString(),
        equityCurve: Array.from({ length: 35 }, (_, i) => ({
          timestamp: new Date(1700000000000 + i * 86400000).toISOString(),
          equity: 100000 + i * 500,
        })),
        testWinRate: 0.6,
        valWinRate: 0.6,
        flags: {
          kellyWired: true,
          circuitBreakerTested: true,
          exchangeConnectivityGreen: true,
        },
      };

      const gateInputs = new Map<string, GateEvaluatorInput>([
        ['strat-promote', gateInput],
      ]);

      const transitions = await evaluateActivePaperPromotions(
        stateMachines,
        candidateConfigs,
        'BTC/USDT',
        '1h',
        '/tmp/run-cards',
        mockPersistLedger,
        gateInputs,
      );

      expect(transitions).toHaveLength(1);
      expect(transitions[0].toState).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(sm.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');
    });
  });

  describe('evaluateLiveRiskHandoff', () => {
    it('delegates to liveCoordinator with correct lifecycle state and fallback signal', () => {
      const sm = new AlphaLifecycleStateMachine('strat-live', 'PROMOTED_LIVE_ELIGIBLE');
      stateMachines.set('strat-live', sm);

      const mockLiveCoordinator: Partial<LiveGuardHandoffCoordinator> = {
        evaluateLiveOrder: vi.fn().mockReturnValue({
          passed: true,
          action: 'ALLOW',
          tierVerdicts: [],
          reasons: [],
          evaluatedAt: Date.now(),
        }),
      };

      const order: PolymarketOrder = {
        marketId: 'mkt-1',
        tokenID: 'tok-1',
        side: 'BUY',
        price: 0.65,
        size: 100,
        nonce: 1,
        expiration: Date.now() + 60000,
        feeRateBps: 10,
        signatureType: 0,
      };

      const verdict = evaluateLiveRiskHandoff(
        mockLiveCoordinator as LiveGuardHandoffCoordinator,
        stateMachines,
        'BTC/USDT',
        {
          strategyId: 'strat-live',
          order,
        },
      );

      expect(verdict.passed).toBe(true);
      expect(mockLiveCoordinator.evaluateLiveOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'strat-live',
          lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
          order,
        }),
      );
    });
  });
});
