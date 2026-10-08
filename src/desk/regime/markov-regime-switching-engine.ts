import {
  MarketRegime,
  RegimeParameters,
  FilteredRegimeEstimate,
} from './regime-types';

export class MarkovRegimeSwitchingEngine {
  // Default transition probability matrix between CALM, VOLATILE, and CRISIS
  private readonly defaultTransitions: Record<MarketRegime, Record<MarketRegime, number>> = {
    CALM: { CALM: 0.95, VOLATILE: 0.045, CRISIS: 0.005 },
    VOLATILE: { CALM: 0.15, VOLATILE: 0.75, CRISIS: 0.10 },
    CRISIS: { CALM: 0.02, VOLATILE: 0.28, CRISIS: 0.70 },
  };

  /**
   * Hamilton filter step: updates prior regime probabilities given new log-return observation
   */
  public filterRegime(
    logReturn: number,
    priorProbabilities: Record<MarketRegime, number>,
    regimeParams: Record<MarketRegime, RegimeParameters>
  ): FilteredRegimeEstimate {
    const states: MarketRegime[] = ['CALM', 'VOLATILE', 'CRISIS'];

    // 1. Time propagation: P(S_t = j | Y_{t-1}) = sum_i P(S_t = j | S_{t-1} = i) * P(S_{t-1} = i)
    const predictedProb: Record<MarketRegime, number> = { CALM: 0, VOLATILE: 0, CRISIS: 0 };
    for (const j of states) {
      let sum = 0;
      for (const i of states) {
        sum += this.defaultTransitions[i][j] * priorProbabilities[i];
      }
      predictedProb[j] = sum;
    }

    // 2. Emission densities: Gaussian likelihood f(y_t | S_t = j)
    const densities: Record<MarketRegime, number> = { CALM: 0, VOLATILE: 0, CRISIS: 0 };
    for (const s of states) {
      const p = regimeParams[s];
      const z = (logReturn - p.meanReturn) / p.volatility;
      densities[s] = (1.0 / (Math.sqrt(2 * Math.PI) * p.volatility)) * Math.exp(-0.5 * z * z);
    }

    // 3. Bayesian update: P(S_t = j | Y_t) proportional to P(S_t = j | Y_{t-1}) * f(y_t | S_t = j)
    const unnormalized: Record<MarketRegime, number> = { CALM: 0, VOLATILE: 0, CRISIS: 0 };
    let totalMass = 0;
    for (const s of states) {
      unnormalized[s] = Math.max(1e-12, predictedProb[s] * densities[s]);
      totalMass += unnormalized[s];
    }

    const posterior: Record<MarketRegime, number> = {
      CALM: Number((unnormalized.CALM / totalMass).toFixed(4)),
      VOLATILE: Number((unnormalized.VOLATILE / totalMass).toFixed(4)),
      CRISIS: Number((unnormalized.CRISIS / totalMass).toFixed(4)),
    };

    let dominantRegime: MarketRegime = 'CALM';
    if (posterior.VOLATILE > posterior.CALM && posterior.VOLATILE > posterior.CRISIS) {
      dominantRegime = 'VOLATILE';
    } else if (posterior.CRISIS > posterior.CALM && posterior.CRISIS > posterior.VOLATILE) {
      dominantRegime = 'CRISIS';
    }

    // Deleveraging: 1.0 in calm, 0.5 in volatile, 0.15 in crisis
    const deleveragingFactor = Number(
      (posterior.CALM * 1.0 + posterior.VOLATILE * 0.5 + posterior.CRISIS * 0.15).toFixed(4)
    );

    return {
      probabilities: posterior,
      dominantRegime,
      confidencePct: Number((posterior[dominantRegime] * 100.0).toFixed(2)),
      suggestedDeleveragingFactor: deleveragingFactor,
    };
  }
}
