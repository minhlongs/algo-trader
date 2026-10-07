import { describe, it, expect, vi } from 'vitest';
import { VaRMonteCarloEngine } from '../../../../src/desk/risk/var-monte-carlo-engine';
import { CorrelatedResolutionStressTester } from '../../../../src/desk/risk/correlated-resolution-stress-tester';
import { DrawdownKillSwitchCircuitBreaker } from '../../../../src/desk/risk/drawdown-kill-switch';

describe('Risk & Stress Testing Trilogy', () => {
  describe('VaRMonteCarloEngine', () => {
    const engine = new VaRMonteCarloEngine({ simulationRuns: 1000 });

    it('simulates binary payoff VaR and CVaR tail metrics', () => {
      const report = engine.simulatePortfolio([
        { marketId: 'm1', outcome: 'YES', quantity: 1000, currentPrice: 0.50 },
        { marketId: 'm2', outcome: 'NO', quantity: 1000, currentPrice: 0.50 },
      ], 123);

      expect(report.portfolioNotionalUsd).toBe(1000);
      expect(report.var95Usd).toBeGreaterThan(0);
      expect(report.cvar95Usd).toBeGreaterThanOrEqual(report.var95Usd);
      expect(report.worstCaseLossUsd).toBeLessThanOrEqual(1000);
    });
  });

  describe('CorrelatedResolutionStressTester', () => {
    const tester = new CorrelatedResolutionStressTester(500); // 500 buffer

    it('evaluates adverse correlated resolution scenario shock', () => {
      const impact = tester.evaluateScenario(
        [
          { marketId: 'trump-win', outcome: 'YES', quantity: 1000, markPrice: 0.60 }, // value 600
          { marketId: 'republican-senate', outcome: 'YES', quantity: 1000, markPrice: 0.70 }, // value 700
        ],
        {
          scenarioName: 'Blue Sweep Cascade',
          description: 'Democrats win Presidency and Senate',
          forcedResolutions: {
            'trump-win': 'NO',
            'republican-senate': 'NO',
          },
        }
      );

      // Pre-stress notional: 1300. Post-stress value: 0. Loss: 1300.
      expect(impact.netStressLossUsd).toBe(1300);
      expect(impact.lossPercentagePct).toBe(100);
      expect(impact.isCapitalBufferBreached).toBe(true);
    });
  });

  describe('DrawdownKillSwitchCircuitBreaker', () => {
    it('progressively trips circuit breaker from throttle to freeze to kill switch', () => {
      const breaker = new DrawdownKillSwitchCircuitBreaker(100000, {
        stage1ThresholdPct: 5.0,  // below 95k -> throttle
        stage2ThresholdPct: 10.0, // below 90k -> freeze
        stage3ThresholdPct: 15.0, // below 85k -> kill switch
      });

      const transitionSpy = vi.fn();
      breaker.on('circuitBreakerTransition', transitionSpy);

      // Normal
      const s1 = breaker.updateEquity(98000); // 2% DD
      expect(s1.state).toBe('NORMAL');
      expect(s1.quotingSizeMultiplier).toBe(1.0);

      // Stage 1 Throttle (6% DD)
      const s2 = breaker.updateEquity(94000);
      expect(s2.state).toBe('STAGE_1_THROTTLE');
      expect(s2.quotingSizeMultiplier).toBe(0.5);

      // Stage 2 Freeze (11% DD)
      const s3 = breaker.updateEquity(89000);
      expect(s3.state).toBe('STAGE_2_FREEZE');
      expect(s3.canOpenNewPositions).toBe(false);

      // Stage 3 Kill Switch (16% DD)
      const s4 = breaker.updateEquity(84000);
      expect(s4.state).toBe('STAGE_3_KILL_SWITCH');
      expect(s4.requiresEmergencyFlattening).toBe(true);
      expect(transitionSpy).toHaveBeenCalledTimes(3);
    });
  });
});
