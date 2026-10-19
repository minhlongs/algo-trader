/**
 * Wave 207: Bollerslev, Gibson & Zhou (2011) Variance Risk Premium Engine.
 * Evaluates options implied variance vs physical expected variance spread.
 * Strictly < 180 LOC, zero :any.
 */

import { OptionQuote, VrpConfig, VrpResult } from './vrp-types';
import { VrpMath } from './vrp-math';

export class VrpEngine {
  private readonly config: VrpConfig;

  constructor(config?: Partial<VrpConfig>) {
    this.config = {
      riskFreeRate: config?.riskFreeRate ?? 0.045,
      timeToMaturityYears: config?.timeToMaturityYears ?? 30.0 / 365.0,
      underlyingPrice: config?.underlyingPrice ?? 100.0,
      forecastHorizonMonths: config?.forecastHorizonMonths ?? 3,
      annualizationFactor: config?.annualizationFactor ?? 252.0,
    };
  }

  /**
   * Evaluate Variance Risk Premium from option quotes and historical realized volatility series.
   */
  public evaluate(
    options: OptionQuote[],
    historicalDailyRealizedVariances: number[]
  ): VrpResult {
    // 1. Model-Free Implied Variance IV_t
    const ivAnnualized = VrpMath.calculateModelFreeImpliedVariance(
      options,
      this.config.underlyingPrice,
      this.config.riskFreeRate,
      this.config.timeToMaturityYears
    );

    // 2. Physical Expected Realized Variance E_t[RV_{t+1}]
    const expRvAnnualized = VrpMath.calculateHarExpectedVariance(
      historicalDailyRealizedVariances
    );

    // 3. VRP = IV - E[RV]
    const vrp = ivAnnualized - expRvAnnualized;
    const vrpPct = expRvAnnualized > 0 ? (vrp / expRvAnnualized) * 100.0 : 0.0;

    // 4. Return Predictability Regression
    const reg = VrpMath.predictExcessReturn(
      vrp,
      this.config.forecastHorizonMonths
    );

    // 5. Regime classification
    let regime: VrpResult['riskPremiumRegime'] = 'NORMAL';
    if (vrp < 0.005) {
      regime = 'COMPRESSED';
    } else if (vrp > 0.08) {
      regime = 'EXTREME_STRESS';
    } else if (vrp > 0.035) {
      regime = 'ELEVATED';
    }

    return {
      impliedVarianceAnnualized: ivAnnualized,
      expectedRealizedVarianceAnnualized: expRvAnnualized,
      varianceRiskPremium: vrp,
      vrpPercent: vrpPct,
      forecastHorizonMonths: this.config.forecastHorizonMonths,
      predictedExcessReturnPct: reg.predictedReturnPct,
      tStatistic: reg.tStat,
      riskPremiumRegime: regime,
      optionQuotesCount: options.length,
    };
  }
}
