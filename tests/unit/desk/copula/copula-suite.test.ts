import { describe, expect, it } from 'vitest';
import { ClaytonCopulaPairsEngine } from '../../../../src/desk/copula/clayton-copula-pairs-engine';
import { PairObservation } from '../../../../src/desk/copula/copula-types';

describe('ClaytonCopulaPairsEngine Suite', () => {
  const engine = new ClaytonCopulaPairsEngine();

  it('should fit Clayton copula parameters from concordant observation sample', () => {
    // Generate synthetic concordant pairs
    const observations: PairObservation[] = [
      { returnX: 0.01, returnY: 0.012 },
      { returnX: 0.02, returnY: 0.019 },
      { returnX: -0.015, returnY: -0.014 },
      { returnX: 0.005, returnY: 0.007 },
      { returnX: -0.02, returnY: -0.025 },
      { returnX: 0.03, returnY: 0.028 },
      { returnX: -0.005, returnY: -0.004 },
      { returnX: 0.015, returnY: 0.018 },
    ];

    const params = engine.fitClayton(observations);

    expect(params.copulaType).toBe('CLAYTON');
    expect(params.kendallTau).toBeGreaterThan(0.5);
    expect(params.parameterTheta).toBeGreaterThan(1.0);
    expect(params.lowerTailDependence).toBeGreaterThan(0.0);
    expect(params.upperTailDependence).toBe(0.0); // Clayton exhibits zero upper-tail dependence
  });

  it('should throw when sample size is insufficient (< 5)', () => {
    const insufficient: PairObservation[] = [
      { returnX: 0.01, returnY: 0.01 },
      { returnX: -0.01, returnY: -0.01 },
    ];

    expect(() => engine.fitClayton(insufficient)).toThrow('At least 5 observations required');
  });

  it('should generate LONG_SPREAD signal when Y conditional probability is below lower threshold', () => {
    // theta = 2.0. u = 0.8 (X performed strongly), v = 0.1 (Y performed very poorly)
    // Conditional P(V <= v | U = u) will be low, meaning Y is abnormally underpriced given X
    const signal = engine.computeConditionalSignal(0.8, 0.05, 2.0, 0.10, 0.90);

    expect(signal.tradeSignal).toBe('LONG_SPREAD');
    expect(signal.conditionalProbabilityYGivenX).toBeLessThan(0.10);
    expect(signal.mispricingScore).toBeLessThan(0);
  });

  it('should generate SHORT_SPREAD signal when Y conditional probability is above upper threshold', () => {
    // u = 0.2 (X dropped), v = 0.95 (Y rallied unusually high)
    const signal = engine.computeConditionalSignal(0.2, 0.95, 2.0, 0.10, 0.90);

    expect(signal.tradeSignal).toBe('SHORT_SPREAD');
    expect(signal.conditionalProbabilityYGivenX).toBeGreaterThan(0.90);
    expect(signal.mispricingScore).toBeGreaterThan(0);
  });

  it('should generate NEUTRAL signal within median conditional bounds', () => {
    const signal = engine.computeConditionalSignal(0.5, 0.5, 2.0, 0.05, 0.95);

    expect(signal.tradeSignal).toBe('NEUTRAL');
    expect(signal.conditionalProbabilityYGivenX).toBeGreaterThan(0.05);
    expect(signal.conditionalProbabilityYGivenX).toBeLessThan(0.95);
  });
});
