import { Thorp2006KellyInput, Thorp2006KellyOutput } from './types';

/**
 * Wave 333: Thorp (2006) & MacLean, Thorp & Ziemba (2011) Continuous Fractional Kelly.
 * Evaluates f* = mu / sigma^2, fractional growth g(c*f*) = f*^2 * sigma^2 * c * (1 - c/2),
 * and probability of reaching drawdown barrier b: P(W_t <= (1-d)W_0) = (1 - d)^(2/c - 1).
 */
export class Thorp2006KellyCriterion {
  public evaluate(input: Thorp2006KellyInput): Thorp2006KellyOutput {
    const mu = Math.max(0, input.expectedExcessReturnAnnual);
    const variance = Math.max(1e-6, input.returnVarianceAnnual);
    const c = Math.min(1, Math.max(0.01, input.fractionalMultiplier));
    const d = Math.min(0.95, Math.max(0.01, input.targetDrawdownThreshold));

    const fullKellyFraction = Number((mu / variance).toFixed(6));
    const effectiveLeverageFraction = Number((c * fullKellyFraction).toFixed(6));
    const expectedLogGrowthRate = Number(
      (fullKellyFraction * fullKellyFraction * variance * c * (1 - 0.5 * c)).toFixed(6),
    );

    const exponent = Math.max(0.1, 2 / c - 1);
    const drawdownBreachProbability = Number(
      Math.min(1, Math.max(0, Math.pow(1 - d, exponent))).toFixed(6),
    );
    const drawdownSurvivalProbability = Number(
      (1 - drawdownBreachProbability).toFixed(6),
    );

    const sizingRegime =
      c >= 0.45
        ? 'AGGRESSIVE_HALF_KELLY'
        : c >= 0.25
          ? 'INSTITUTIONAL_FRACTIONAL'
          : 'DEFENSIVE_TAIL_SHIELD';

    return {
      fullKellyFraction,
      effectiveLeverageFraction,
      expectedLogGrowthRate,
      drawdownBreachProbability,
      drawdownSurvivalProbability,
      sizingRegime,
    };
  }
}
