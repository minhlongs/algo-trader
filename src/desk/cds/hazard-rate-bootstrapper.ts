import { CdsContractQuote, HazardRateCurvePoint } from './cds-types';

export class HazardRateBootstrapper {
  /**
   * Bootstraps piecewise constant default hazard rate lambda from CDS par spread:
   * S = (1 - R) * lambda  =>  lambda = S / (1 - R)
   * Survival Probability: Q(t) = exp(-lambda * t)
   */
  public bootstrapHazardRate(cds: CdsContractQuote): HazardRateCurvePoint {
    const { parSpreadBps, standardRecoveryRatePct, tenorYears } = cds;
    if (tenorYears <= 0) throw new Error('Tenor must be positive');
    if (standardRecoveryRatePct >= 100 || standardRecoveryRatePct < 0) {
      throw new Error('Recovery rate must be in [0, 100)');
    }

    const lossGivenDefault = (100.0 - standardRecoveryRatePct) / 100.0;
    const spreadDecimal = parSpreadBps / 10000.0;

    // Hazard rate lambda = S / (1 - R)
    const lambda = spreadDecimal / lossGivenDefault;
    const lambdaPct = lambda * 100.0;

    // Q(T) = exp(-lambda * T)
    const survivalProb = Math.exp(-lambda * tenorYears);
    const survivalProbPct = survivalProb * 100.0;
    const defaultProbPct = (1.0 - survivalProb) * 100.0;

    return {
      tenorYears,
      hazardRateAnnualizedPct: Number(lambdaPct.toFixed(4)),
      survivalProbabilityPct: Number(survivalProbPct.toFixed(4)),
      cumulativeDefaultProbabilityPct: Number(defaultProbPct.toFixed(4)),
    };
  }

  /**
   * Evaluates hazard rate curve across multiple tenors
   */
  public generateTermStructure(
    quotes: CdsContractQuote[]
  ): HazardRateCurvePoint[] {
    return quotes.map((q) => this.bootstrapHazardRate(q));
  }
}
