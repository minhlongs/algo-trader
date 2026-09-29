import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlphaLifecycleStateMachine,
  type AlphaLifecycleState,
  DEFAULT_PROMOTION_CRITERIA,
} from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import type { AlphaSurvivalGateEvaluation } from '../../../../src/alpha-lab/attribution/alpha-survival-gate-types';
import {
  serializeStateMachine,
  deserializeStateMachine,
  serializeStateMachineToJson,
  deserializeStateMachineFromJson,
  serializeStateMachines,
  deserializeStateMachines,
  saveStateMachineToFile,
  loadStateMachineFromFile,
} from '../../../../src/alpha-lab/attribution/alpha-lifecycle-persistence';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promises as fs } from 'node:fs';

describe('AlphaLifecycleStateMachine Canonical 6-State Lifecycle & Promotion Protocol', () => {
  let sm: AlphaLifecycleStateMachine;

  const makePassingSurvivalEvaluation = (): AlphaSurvivalGateEvaluation => ({
    passed: true,
    evaluatedAt: new Date().toISOString(),
    sharpeRatio: 1.85,
    maxDrawdown: 0.08,
    profitFactor: 1.6,
    dsr: 0.98,
    regimeConsistencyScore: 0.80,
    regimeConsistencyPassed: true,
    costStressPassed: true,
    conservativePnl: 1500,
    adversePnl: 800,
    metrics: {
      oosSharpeRatio: 1.85,
      maxDrawdown: 0.08,
      profitFactor: 1.6,
      dsr: 0.98,
      expectedMaxSharpe: 0.45,
      skewness: -0.1,
      kurtosis: 3.2,
      regimeConsistencyScore: 0.80,
      splitConsistencyScore: 0.85,
      conservativeStressPnl: 1500,
      adverseStressPnl: 800,
      conservativeStressSharpe: 1.4,
      adverseStressSharpe: 1.1,
      stressedPnl3x: 600,
      testWinRate: 0.58,
      testProfitFactor: 1.6,
      totalTestTrades: 35,
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
      nTrials: 1,
    },
    diagnostics: [],
    failures: [],
    rejectionReasons: [],
  });

  const makeFailingSurvivalEvaluation = (): AlphaSurvivalGateEvaluation => ({
    ...makePassingSurvivalEvaluation(),
    passed: false,
    sharpeRatio: 0.8,
    diagnostics: ['OOS Sharpe 0.80 < 1.50 hurdle'],
    failures: ['OOS Sharpe 0.80 < 1.50 hurdle'],
    rejectionReasons: ['OOS Sharpe 0.80 < 1.50 hurdle'],
    checks: {
      ...makePassingSurvivalEvaluation().checks,
      sharpePassed: false,
    },
  });

  beforeEach(() => {
    sm = new AlphaLifecycleStateMachine('strat-alpha-001', 'DISCOVERED');
  });

  describe('Initial State & State Helpers', () => {
    it('initializes to DISCOVERED with empty history and correct boolean helpers', () => {
      expect(sm.getState()).toBe('DISCOVERED');
      expect(sm.getStrategyId()).toBe('strat-alpha-001');
      expect(sm.isValidated()).toBe(false);
      expect(sm.isPaperActive()).toBe(false);
      expect(sm.isQuarantined()).toBe(false);
      expect(sm.isPromoted()).toBe(false);
      expect(sm.isLiveEligible()).toBe(false);
      expect(sm.isRetired()).toBe(false);
      expect(sm.getHistory()).toEqual([]);
    });

    it('correctly reports state across all 6 canonical states', () => {
      const states: AlphaLifecycleState[] = [
        'DISCOVERED',
        'VALIDATED',
        'PAPER_ACTIVE',
        'PROMOTED_LIVE_ELIGIBLE',
        'QUARANTINED',
        'RETIRED',
      ];
      for (const st of states) {
        const machine = new AlphaLifecycleStateMachine('strat-test', st);
        expect(machine.getState()).toBe(st);
        expect(machine.isValidated()).toBe(st === 'VALIDATED');
        expect(machine.isPaperActive()).toBe(st === 'PAPER_ACTIVE');
        expect(machine.isQuarantined()).toBe(st === 'QUARANTINED');
        expect(machine.isPromoted()).toBe(st === 'PROMOTED_LIVE_ELIGIBLE');
        expect(machine.isLiveEligible()).toBe(st === 'PROMOTED_LIVE_ELIGIBLE');
        expect(machine.isRetired()).toBe(st === 'RETIRED');
      }
    });
  });

  describe('Transition: DISCOVERED -> VALIDATED or RETIRED (validateCandidate)', () => {
    it('transitions DISCOVERED -> VALIDATED on passing survival gate evaluation', () => {
      const evalResult = makePassingSurvivalEvaluation();
      const transition = sm.validateCandidate(evalResult);

      expect(transition.fromState).toBe('DISCOVERED');
      expect(transition.toState).toBe('VALIDATED');
      expect(sm.getState()).toBe('VALIDATED');
      expect(sm.isValidated()).toBe(true);
      expect(sm.getHistory()).toHaveLength(1);
      expect(transition.metricsSnapshot.sharpeRatio).toBe(1.85);
      expect(transition.metricsSnapshot.maxDrawdown).toBe(0.08);
    });

    it('transitions DISCOVERED -> RETIRED on failing survival gate evaluation', () => {
      const evalResult = makeFailingSurvivalEvaluation();
      const transition = sm.validateCandidate(evalResult);

      expect(transition.fromState).toBe('DISCOVERED');
      expect(transition.toState).toBe('RETIRED');
      expect(sm.getState()).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(transition.reason).toContain('OOS Sharpe 0.80 < 1.50 hurdle');
    });

    it('throws if validateCandidate is called from a non-DISCOVERED state', () => {
      sm.validateCandidate(makePassingSurvivalEvaluation());
      expect(sm.getState()).toBe('VALIDATED');

      expect(() => sm.validateCandidate(makePassingSurvivalEvaluation())).toThrow(
        /expected DISCOVERED/,
      );
    });
  });

  describe('Transition: VALIDATED -> PAPER_ACTIVE (startPaperTrading)', () => {
    it('transitions VALIDATED -> PAPER_ACTIVE on startPaperTrading', () => {
      sm.validateCandidate(makePassingSurvivalEvaluation());
      const transition = sm.startPaperTrading('Deploying to paper loop');

      expect(transition.fromState).toBe('VALIDATED');
      expect(transition.toState).toBe('PAPER_ACTIVE');
      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(sm.isPaperActive()).toBe(true);
      expect(sm.getHistory()).toHaveLength(2);
    });

    it('supports backward-compatible transition DISCOVERED -> PAPER_ACTIVE', () => {
      const transition = sm.startPaperTrading('Legacy direct ingest');
      expect(transition.fromState).toBe('DISCOVERED');
      expect(transition.toState).toBe('PAPER_ACTIVE');
      expect(sm.getState()).toBe('PAPER_ACTIVE');
    });

    it('throws if startPaperTrading is called on QUARANTINED or RETIRED strategy', () => {
      const retiredSm = new AlphaLifecycleStateMachine('strat-r', 'RETIRED');
      expect(() => retiredSm.startPaperTrading()).toThrow(/absorbing state/);

      const quarantinedSm = new AlphaLifecycleStateMachine('strat-q', 'QUARANTINED');
      expect(() => quarantinedSm.startPaperTrading()).toThrow(/QUARANTINED/);
    });
  });

  describe('Transition: PAPER_ACTIVE -> PROMOTED_LIVE_ELIGIBLE (checkPromotion)', () => {
    beforeEach(() => {
      sm.validateCandidate(makePassingSurvivalEvaluation());
      sm.startPaperTrading();
    });

    it('promotes to PROMOTED_LIVE_ELIGIBLE when all hurdles are satisfied (50 trades, Sharpe 1.5, DD 10%)', () => {
      const transition = sm.checkPromotion({
        tradeCount: 50,
        cumulativeSharpe: 1.55,
        maxDrawdown: 0.08,
        winRate: 0.60,
        totalNetPnl: 4500,
      });

      expect(transition).not.toBeNull();
      expect(transition!.fromState).toBe('PAPER_ACTIVE');
      expect(transition!.toState).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(sm.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(sm.isPromoted()).toBe(true);
      expect(sm.isLiveEligible()).toBe(true);
    });

    it('rejects promotion if trade count is below hurdle (< 50)', () => {
      const transition = sm.checkPromotion({
        tradeCount: 49,
        cumulativeSharpe: 2.0,
        maxDrawdown: 0.05,
      });

      expect(transition).toBeNull();
      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(sm.isPromoted()).toBe(false);
    });

    it('rejects promotion if cumulative Sharpe is below hurdle (< 1.5)', () => {
      const transition = sm.checkPromotion({
        tradeCount: 60,
        cumulativeSharpe: 1.49,
        maxDrawdown: 0.05,
      });

      expect(transition).toBeNull();
      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(sm.isPromoted()).toBe(false);
    });

    it('rejects promotion if max drawdown exceeds 10% ceiling (> 0.10)', () => {
      const transition = sm.checkPromotion({
        tradeCount: 60,
        cumulativeSharpe: 2.0,
        maxDrawdown: 0.105,
      });

      expect(transition).toBeNull();
      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(sm.isPromoted()).toBe(false);
    });

    it('boundary check: exactly 50 trades, 1.50 Sharpe, 10.0% drawdown promotes successfully', () => {
      const transition = sm.checkPromotion({
        tradeCount: DEFAULT_PROMOTION_CRITERIA.minTradeCount,
        cumulativeSharpe: DEFAULT_PROMOTION_CRITERIA.minCumulativeSharpe,
        maxDrawdown: DEFAULT_PROMOTION_CRITERIA.maxDrawdown,
      });

      expect(transition).not.toBeNull();
      expect(sm.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');
    });

    it('returns null if checkPromotion is called on non-PAPER_ACTIVE strategy', () => {
      const discSm = new AlphaLifecycleStateMachine('s1', 'DISCOVERED');
      expect(discSm.checkPromotion({ tradeCount: 100, cumulativeSharpe: 2.0, maxDrawdown: 0.05 })).toBeNull();
    });
  });

  describe('Circuit Breaker Quarantine & Operator Clearance', () => {
    beforeEach(() => {
      sm.validateCandidate(makePassingSurvivalEvaluation());
      sm.startPaperTrading();
    });

    it('quarantines strategy when paper drawdown breaches 10% (checkDrawdownQuarantine)', () => {
      expect(sm.checkDrawdownQuarantine(0.09)).toBe(false);
      expect(sm.getState()).toBe('PAPER_ACTIVE');

      const tripped = sm.checkDrawdownQuarantine(0.10);
      expect(tripped).toBe(true);
      expect(sm.getState()).toBe('QUARANTINED');
      expect(sm.isQuarantined()).toBe(true);
    });

    it('quarantines strategy via recordDrawdown and returns transition', () => {
      expect(sm.recordDrawdown(0.08)).toBeNull();
      expect(sm.getState()).toBe('PAPER_ACTIVE');

      const transition = sm.recordDrawdown(0.105);
      expect(transition).not.toBeNull();
      expect(transition!.fromState).toBe('PAPER_ACTIVE');
      expect(transition!.toState).toBe('QUARANTINED');
      expect(sm.getState()).toBe('QUARANTINED');
      expect(sm.isQuarantined()).toBe(true);
    });

    it('also quarantines a PROMOTED_LIVE_ELIGIBLE strategy if it experiences severe drawdown', () => {
      sm.checkPromotion({ tradeCount: 50, cumulativeSharpe: 2.0, maxDrawdown: 0.05 });
      expect(sm.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');

      const tripped = sm.checkDrawdownQuarantine(0.11);
      expect(tripped).toBe(true);
      expect(sm.getState()).toBe('QUARANTINED');
    });

    it('clears quarantine on operator clearance and restores to PAPER_ACTIVE', () => {
      sm.checkDrawdownQuarantine(0.10);
      expect(sm.isQuarantined()).toBe(true);

      const transition = sm.clearQuarantine('Operator cleared parameter bounds');
      expect(transition.fromState).toBe('QUARANTINED');
      expect(transition.toState).toBe('PAPER_ACTIVE');
      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(sm.isPaperActive()).toBe(true);
    });

    it('throws when clearQuarantine is called on a non-QUARANTINED strategy', () => {
      expect(() => sm.clearQuarantine()).toThrow(/expected QUARANTINED/);
    });

    it('decommissions a QUARANTINED strategy directly to RETIRED', () => {
      sm.checkDrawdownQuarantine(0.12);
      expect(sm.isQuarantined()).toBe(true);

      const transition = sm.decommission('Drawdown root cause was structural flaw');
      expect(transition.fromState).toBe('QUARANTINED');
      expect(transition.toState).toBe('RETIRED');
      expect(sm.getState()).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
    });
  });

  describe('Retirement & Terminal Absorbing State', () => {
    it('retires directly from DISCOVERED or VALIDATED', () => {
      const s1 = new AlphaLifecycleStateMachine('s1', 'DISCOVERED');
      s1.retire('Strategy parameter bounds invalidated');
      expect(s1.getState()).toBe('RETIRED');

      const s2 = new AlphaLifecycleStateMachine('s2', 'VALIDATED');
      s2.retire('Regime changed before paper deployment');
      expect(s2.getState()).toBe('RETIRED');
    });

    it('prevents any further transitions once RETIRED (absorbing state)', () => {
      sm.retire('Manual retirement');
      expect(sm.isRetired()).toBe(true);

      expect(() => sm.startPaperTrading()).toThrow(/absorbing state/);
      expect(() => sm.validateCandidate(makePassingSurvivalEvaluation())).toThrow(/RETIRED state/);
      expect(() => sm.retire('Second retirement')).toThrow(/already RETIRED/);
      expect(() => sm.decommission()).toThrow(/already RETIRED/);
    });
  });

  describe('Persistence Serialization & Deserialization', () => {
    it('safely serializes and deserializes across all 6 states with full history', () => {
      const states: AlphaLifecycleState[] = [
        'DISCOVERED',
        'VALIDATED',
        'PAPER_ACTIVE',
        'PROMOTED_LIVE_ELIGIBLE',
        'QUARANTINED',
        'RETIRED',
      ];

      for (const state of states) {
        let original: AlphaLifecycleStateMachine;
        if (state === 'VALIDATED') {
          original = new AlphaLifecycleStateMachine('strat-persist-1', 'DISCOVERED');
          original.validateCandidate(makePassingSurvivalEvaluation());
        } else {
          original = new AlphaLifecycleStateMachine('strat-persist-1', state);
        }

        const snapshot = serializeStateMachine(original);
        expect(snapshot.strategyId).toBe('strat-persist-1');
        expect(snapshot.state).toBe(original.getState());
        expect(snapshot.version).toBe(1);

        const restored = deserializeStateMachine(snapshot);
        expect(restored.getStrategyId()).toBe(original.getStrategyId());
        expect(restored.getState()).toBe(original.getState());
        expect(restored.getHistory().length).toBe(original.getHistory().length);
      }
    });

    it('round-trips JSON serialization safely', () => {
      sm.validateCandidate(makePassingSurvivalEvaluation());
      sm.startPaperTrading();
      sm.checkDrawdownQuarantine(0.10);

      const json = serializeStateMachineToJson(sm, true);
      const restored = deserializeStateMachineFromJson(json);

      expect(restored.getStrategyId()).toBe('strat-alpha-001');
      expect(restored.getState()).toBe('QUARANTINED');
      expect(restored.isQuarantined()).toBe(true);
      expect(restored.getHistory().length).toBe(3);
    });

    it('batch serializes and deserializes Map of state machines', () => {
      const machines = new Map<string, AlphaLifecycleStateMachine>([
        ['strat-1', new AlphaLifecycleStateMachine('strat-1', 'DISCOVERED')],
        ['strat-2', new AlphaLifecycleStateMachine('strat-2', 'VALIDATED')],
        ['strat-3', new AlphaLifecycleStateMachine('strat-3', 'PAPER_ACTIVE')],
        ['strat-4', new AlphaLifecycleStateMachine('strat-4', 'QUARANTINED')],
      ]);

      const snapshots = serializeStateMachines(machines);
      expect(Object.keys(snapshots)).toHaveLength(4);

      const restoredMap = deserializeStateMachines(snapshots);
      expect(restoredMap.size).toBe(4);
      expect(restoredMap.get('strat-4')?.isQuarantined()).toBe(true);
    });

    it('persists and restores state machine from filesystem file', async () => {
      sm.validateCandidate(makePassingSurvivalEvaluation());
      sm.startPaperTrading();
      sm.checkPromotion({ tradeCount: 55, cumulativeSharpe: 1.8, maxDrawdown: 0.05 });

      const testFile = join(tmpdir(), `sm-test-${Date.now()}.json`);
      try {
        await saveStateMachineToFile(sm, testFile);
        const restored = await loadStateMachineFromFile(testFile);

        expect(restored.getStrategyId()).toBe('strat-alpha-001');
        expect(restored.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');
        expect(restored.isPromoted()).toBe(true);
      } finally {
        await fs.unlink(testFile).catch(() => {});
      }
    });

    it('throws descriptive errors on corrupt or invalid snapshots', () => {
      expect(() => deserializeStateMachine({} as never)).toThrow(/missing or invalid strategyId/);
      expect(() => deserializeStateMachine({ strategyId: 's1', state: 'INVALID_STATE' as never, history: [], version: 1, savedAt: 1 })).toThrow(/unknown lifecycle state/);
      expect(() => deserializeStateMachineFromJson('not-valid-json')).toThrow(/Failed to deserialize/);
    });
  });
});
