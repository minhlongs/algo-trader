import { PerpMarketQuote, FundingRateMetrics } from './funding-types';

export class PerpetualFundingPredictor {
  /**
   * Computes Premium Index and 8-hour Funding Rate
   * Premium Index = (Max(0, ImpactBid - Index) - Max(0, Index - ImpactAsk)) / Index
   * Funding Rate = PremiumIndex + Clamp(InterestRate - PremiumIndex, -0.05%, +0.05%)
   */
  public computeFundingRate(
    quote: PerpMarketQuote,
    baseInterestRate8hPct = 0.01 // Standard 0.01% per 8h
  ): FundingRateMetrics {
    const { indexPrice, impactBidPrice, impactAskPrice, symbol } = quote;
    if (indexPrice <= 0) throw new Error('Index price must be strictly positive');

    const bidDiff = Math.max(0, impactBidPrice - indexPrice);
    const askDiff = Math.max(0, indexPrice - impactAskPrice);
    const premiumFraction = (bidDiff - askDiff) / indexPrice;
    const premiumPct = premiumFraction * 100.0;

    const diff = baseInterestRate8hPct - premiumPct;
    const clampedDiff = Math.max(-0.05, Math.min(0.05, diff));
    const fundingRate8h = premiumPct + clampedDiff;

    // Compound 3 payments/day over 365 days = 1095 funding cycles
    const ratePerCycle = fundingRate8h / 100.0;
    const annualizedCarryApy =
      ratePerCycle > 0 ? (Math.pow(1.0 + ratePerCycle, 1095) - 1.0) * 100.0 : ratePerCycle * 1095 * 100.0;

    return {
      symbol,
      premiumIndexPct: Number(premiumPct.toFixed(4)),
      eightHourFundingRatePct: Number(fundingRate8h.toFixed(4)),
      annualizedCarryApyPct: Number(annualizedCarryApy.toFixed(2)),
      isPayingLongs: fundingRate8h > 0,
    };
  }
}
