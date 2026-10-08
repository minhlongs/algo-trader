import { RollEstimator } from './roll-estimator';
import {
  AmihudIlliqResult,
  LiquidityRegime,
  MarketTradePoint,
  PriceImpactResult,
  RollSpreadResult,
  UnifiedLiquidityReport,
} from './roll-amihud-types';

export class AmihudEngine {
  public calculateAmihudIlliq(trades: MarketTradePoint[]): AmihudIlliqResult {
    if (trades.length < 2) {
      throw new Error('At least 2 observations required for Amihud illiquidity calculation');
    }

    let sumRatios = 0;
    let sumAbsReturn = 0;
    let sumDollarVol = 0;
    let validPairs = 0;

    for (let i = 1; i < trades.length; i++) {
      const prev = trades[i - 1]!;
      const curr = trades[i]!;

      if (prev.price <= 0 || curr.price <= 0) {
        throw new Error('Prices must be strictly positive');
      }

      const absReturn = Math.abs((curr.price - prev.price) / prev.price);
      const dollarVolume = curr.price * curr.volume;

      if (dollarVolume > 0) {
        sumRatios += absReturn / dollarVolume;
        sumAbsReturn += absReturn;
        sumDollarVol += dollarVolume;
        validPairs++;
      }
    }

    if (validPairs === 0) {
      throw new Error('All trade observations have zero trading volume');
    }

    const rawAmihud = sumRatios / validPairs;
    const scaledAmihud = rawAmihud * 1e6;
    const avgAbsReturnPct = (sumAbsReturn / validPairs) * 100.0;
    const avgDollarVol = sumDollarVol / validPairs;

    let liquidityRegime: LiquidityRegime = 'NORMAL';
    if (scaledAmihud < 0.05) {
      liquidityRegime = 'HIGH_LIQUIDITY';
    } else if (scaledAmihud <= 0.5) {
      liquidityRegime = 'NORMAL';
    } else if (scaledAmihud <= 2.0) {
      liquidityRegime = 'ELEVATED_IMPACT';
    } else {
      liquidityRegime = 'ILLIQUID_DISTRESSED';
    }

    return {
      rawAmihudRatio: Number(rawAmihud.toExponential(4)),
      scaledAmihudRatio: Number(scaledAmihud.toFixed(4)),
      averageAbsoluteReturnPct: Number(avgAbsReturnPct.toFixed(4)),
      averageDollarVolume: Number(avgDollarVol.toFixed(2)),
      liquidityRegime,
    };
  }

  public estimatePriceImpact(trades: MarketTradePoint[]): PriceImpactResult {
    const signedTrades = trades.filter((t) => t.tradeDirection !== undefined);
    if (signedTrades.length < 3) {
      return { kyleLambdaProxy: 0.0, rSquared: 0.0 };
    }

    // Regression: Delta P = lambda * SignedVolume + epsilon
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    const n = signedTrades.length - 1;

    for (let i = 0; i < n; i++) {
      const x = signedTrades[i]!.volume * (signedTrades[i]!.tradeDirection || 1);
      const y = signedTrades[i + 1]!.price - signedTrades[i]!.price;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-12) return { kyleLambdaProxy: 0.0, rSquared: 0.0 };

    const lambda = (n * sumXY - sumX * sumY) / denom;
    const totalSS = n * sumY2 - sumY * sumY;
    const rSq = totalSS > 0 ? Math.pow(n * sumXY - sumX * sumY, 2) / (denom * totalSS) : 0;

    return {
      kyleLambdaProxy: Number(Math.max(0, lambda).toFixed(6)),
      rSquared: Number(Math.max(0, Math.min(1.0, rSq)).toFixed(4)),
    };
  }

  public assessMarketLiquidity(trades: MarketTradePoint[]): UnifiedLiquidityReport {
    const rollSpread: RollSpreadResult = RollEstimator.calculateRollSpread(trades);
    const amihud: AmihudIlliqResult = this.calculateAmihudIlliq(trades);
    const impact: PriceImpactResult = this.estimatePriceImpact(trades);

    // Composite liquidity score: 100 is ultra liquid, 0 is completely illiquid
    const spreadPenalty = Math.min(50, rollSpread.effectiveSpreadPct * 20);
    const amihudPenalty = Math.min(50, amihud.scaledAmihudRatio * 25);
    const score = Math.max(0, Math.min(100, 100 - (spreadPenalty + amihudPenalty)));

    return {
      rollSpread,
      amihud,
      impact,
      compositeLiquidityScore: Number(score.toFixed(2)),
    };
  }
}
