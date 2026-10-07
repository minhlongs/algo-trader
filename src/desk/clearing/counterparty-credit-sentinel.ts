/**
 * Counterparty Credit Exposure & Haircut Sentinel
 * Tracks bilateral Current Exposure (CE), 99% PFE, and dynamic collateral haircuts under volatility shocks.
 *
 * @module desk/clearing/counterparty-credit-sentinel
 */

import type {
  BilateralTradePosition,
  CounterpartyCreditProfile,
  CounterpartyExposureMetrics,
  CreditSentinelConfig,
} from './counterparty-credit-types';

export class CounterpartyCreditSentinel {
  private readonly pfeZ: number;
  private readonly baseHaircutStable: number;
  private readonly baseHaircutVolatile: number;

  public constructor(config: CreditSentinelConfig = {}) {
    this.pfeZ = config.pfeConfidenceZ ?? 2.326; // 99% one-sided normal confidence
    this.baseHaircutStable = config.baseHaircutUsdc ?? 0.02;
    this.baseHaircutVolatile = config.baseHaircutVolatile ?? 0.25;
  }

  public evaluateCounterparty(
    profile: CounterpartyCreditProfile,
    trades: readonly BilateralTradePosition[]
  ): CounterpartyExposureMetrics {
    // 1. Current Exposure (CE) = max(0, sum(MtM))
    let totalMtM = 0;
    let pfeVarianceSum = 0;

    for (const t of trades) {
      totalMtM += t.markToMarketUsd;
      const tYears = Math.max(1 / 365, t.timeToMaturityDays / 365);
      const posSigma = t.notionalUsd * t.annualizedVol * Math.sqrt(tYears);
      pfeVarianceSum += posSigma * posSigma;
    }

    const currentExposureUsd = Math.max(0, totalMtM);
    // 99% Potential Future Exposure: MtM + z * sigma_portfolio
    const pfeVol = Math.sqrt(pfeVarianceSum);
    const potentialFutureExposure99Usd = Math.round(currentExposureUsd + this.pfeZ * pfeVol);

    // 2. Dynamic Collateral Haircut
    let haircut = profile.collateralAssetType === 'VOLATILE_TOKEN'
      ? this.baseHaircutVolatile
      : this.baseHaircutStable;

    // Elevate haircut if wrong-way risk is detected
    if (profile.isWrongWayRiskExposed) {
      haircut += 0.15;
    }

    // Rating downgrade penalty
    if (profile.creditRatingGrade === 'SUB_INVESTMENT') {
      haircut += 0.10;
    }

    const effectiveHaircutPct = Math.min(0.90, haircut);
    const netCollateralValueUsd = Math.round(profile.collateralHeldUsd * (1 - effectiveHaircutPct));

    // Net Credit Risk = max(0, PFE_99 - NetCollateral)
    const netCreditRiskUsd = Math.max(0, potentialFutureExposure99Usd - netCollateralValueUsd);
    const isMarginCallTriggered = netCreditRiskUsd > 0;

    return {
      counterpartyId: profile.counterpartyId,
      currentExposureUsd: Math.round(currentExposureUsd),
      potentialFutureExposure99Usd,
      effectiveHaircutPct: Math.round(effectiveHaircutPct * 1000) / 10,
      netCollateralValueUsd,
      netCreditRiskUsd,
      isMarginCallTriggered,
    };
  }
}
