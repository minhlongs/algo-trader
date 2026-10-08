import { describe, it, expect } from 'vitest';
import { MarkovRegimeSwitchingEngine } from '../../../../src/desk/regime/markov-regime-switching-engine';
import { DynamicConditionalCorrelationEngine } from '../../../../src/desk/regime/dynamic-conditional-correlation-engine';
import { RegimeParameters, MarketRegime } from '../../../../src/desk/regime/regime-types';

describe('Volatility & Covariance Regime-Switching Desk Suite', () => {
  describe('MarkovRegimeSwitchingEngine', () => {
    it('updates posterior probabilities to reflect a crisis shock', () => {
      const engine = new MarkovRegimeSwitchingEngine();

      const regimeParams: Record<MarketRegime, RegimeParameters> = {
        CALM: { state: 'CALM', meanReturn: 0.0005, volatility: 0.008 },
        VOLATILE: { state: 'VOLATILE', meanReturn: -0.001, volatility: 0.02 },
        CRISIS: { state: 'CRISIS', meanReturn: -0.05, volatility: 0.06 },
      };

      const priors: Record<MarketRegime, number> = {
        CALM: 0.80,
        VOLATILE: 0.15,
        CRISIS: 0.05,
      };

      // Sudden -8% log return crash
      const res = engine.filterRegime(-0.08, priors, regimeParams);

      expect(res.dominantRegime).toBe('CRISIS');
      expect(res.probabilities.CRISIS).toBeGreaterThan(0.70);
      expect(res.suggestedDeleveragingFactor).toBeLessThan(0.5); // De-risk portfolio
    });
  });

  describe('DynamicConditionalCorrelationEngine', () => {
    it('updates correlation matrix given standardized asset return shocks', () => {
      const engine = new DynamicConditionalCorrelationEngine();

      const residuals = [1.5, 1.4]; // Co-moving positive shocks
      const unconditional = [
        [1.0, 0.4],
        [0.4, 1.0],
      ];
      const prevQ = [
        [1.0, 0.45],
        [0.45, 1.0],
      ];

      const res = engine.updateCorrelation(residuals, unconditional, prevQ);

      expect(res.correlationMatrix.length).toBe(2);
      expect(res.correlationMatrix[0]![0]).toBe(1.0);
      expect(res.correlationMatrix[0]![1]).toBeGreaterThan(0.4);
      expect(res.isCorrelationBreakdown).toBe(false);
    });
  });
});
