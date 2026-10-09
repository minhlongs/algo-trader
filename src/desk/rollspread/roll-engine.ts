import { RollTradePoint, RollSpreadConfig, RollSpreadResult } from './roll-types.js';
import { RollMath } from './roll-math.js';

export class RollEngine {
  public static validate(prices: number[], minTrades: number): void {
    if (prices.length < minTrades) {
      throw new Error(`Insufficient trade points: received ${prices.length}, required minimum is ${minTrades}`);
    }
    for (const p of prices) {
      if (p <= 0 || !Number.isFinite(p)) {
        throw new Error('All trade prices must be strictly positive finite numbers');
      }
    }
  }

  public static estimateSpread(
    trades: (RollTradePoint | number)[],
    config: RollSpreadConfig = {}
  ): RollSpreadResult {
    const minTrades = config.minTrades ?? 5;
    const prices = trades.map(t => (typeof t === 'number' ? t : t.price));

    this.validate(prices, minTrades);

    const deltaP = RollMath.calculatePriceChanges(prices);
    const meanPrice = RollMath.mean(prices);
    const covLag1 = RollMath.autocovarianceLag1(deltaP);
    const varDeltaP = RollMath.variance(deltaP);

    const { spread, isNegative } = RollMath.calculateEffectiveSpread(
      covLag1,
      config.handlePositiveCovariance ?? 'zero'
    );

    const percentageSpread = meanPrice > 0 ? (spread / meanPrice) * 100 : 0;

    // Roll bid-ask bounce variance contribution: Var_bounce = S^2 / 2 = 2 * (-covLag1)
    const bounceVariance = isNegative ? -2.0 * covLag1 : 0;
    const bounceVarianceShare = varDeltaP > 0 ? Math.min(1.0, bounceVariance / varDeltaP) : 0;

    return {
      sampleSize: prices.length,
      firstOrderCovariance: covLag1,
      effectiveSpread: spread,
      percentageSpread,
      priceVariance: varDeltaP,
      bounceVarianceShare,
      isCovarianceNegative: isNegative,
    };
  }

  /**
   * Helper to simulate a stylized bid-ask bounce series around fair value
   */
  public static simulateBounceSeries(
    fairValue: number,
    halfSpread: number,
    numTrades: number,
    orderFlowSigns: (-1 | 1)[]
  ): number[] {
    const prices: number[] = [];
    for (let i = 0; i < numTrades; i++) {
      const sign = orderFlowSigns[i % orderFlowSigns.length];
      prices.push(fairValue + sign * halfSpread);
    }
    return prices;
  }
}
