import {
  GarmanKohlhagenParams,
  GarmanKohlhagenResult,
  FxImpliedVolParams,
} from './garman-kohlhagen-types';
import { GarmanKohlhagenMath } from './garman-kohlhagen-math';

export class GarmanKohlhagenEngine {
  public static evaluate(params: GarmanKohlhagenParams): GarmanKohlhagenResult {
    this.validateParams(params);

    const { spotRate, strikeRate, timeToMaturity, domesticRate, foreignRate, volatility, optionType } =
      params;

    const { d1, d2 } = GarmanKohlhagenMath.computeD1D2(
      spotRate,
      strikeRate,
      timeToMaturity,
      domesticRate,
      foreignRate,
      volatility
    );

    const price = GarmanKohlhagenMath.calculatePrice(
      spotRate,
      strikeRate,
      timeToMaturity,
      domesticRate,
      foreignRate,
      volatility,
      optionType
    );

    const greeks = GarmanKohlhagenMath.calculateGreeks(
      spotRate,
      strikeRate,
      timeToMaturity,
      domesticRate,
      foreignRate,
      volatility,
      optionType
    );

    const forwardRate = spotRate * Math.exp((domesticRate - foreignRate) * timeToMaturity);

    // Theoretical Put-Call Parity: C - P = S*exp(-rf*T) - K*exp(-rd*T)
    const callPrice = GarmanKohlhagenMath.calculatePrice(
      spotRate,
      strikeRate,
      timeToMaturity,
      domesticRate,
      foreignRate,
      volatility,
      'call'
    );
    const putPrice = GarmanKohlhagenMath.calculatePrice(
      spotRate,
      strikeRate,
      timeToMaturity,
      domesticRate,
      foreignRate,
      volatility,
      'put'
    );
    const parityLhs = callPrice - putPrice;
    const parityRhs =
      spotRate * Math.exp(-foreignRate * timeToMaturity) -
      strikeRate * Math.exp(-domesticRate * timeToMaturity);
    const paritySpread = parityLhs - parityRhs;

    return {
      price,
      d1,
      d2,
      greeks,
      forwardRate,
      paritySpread,
    };
  }

  public static calculateImpliedVolatility(params: FxImpliedVolParams): number {
    if (params.spotRate <= 0 || params.strikeRate <= 0 || params.targetPrice < 0) {
      throw new Error('Invalid input parameters for implied volatility calculation');
    }
    return GarmanKohlhagenMath.solveImpliedVol(
      params.spotRate,
      params.strikeRate,
      params.timeToMaturity,
      params.domesticRate,
      params.foreignRate,
      params.targetPrice,
      params.optionType,
      params.initialVolGuess ?? 0.2,
      params.tolerance ?? 1e-8,
      params.maxIterations ?? 100
    );
  }

  private static validateParams(params: GarmanKohlhagenParams): void {
    if (params.spotRate <= 0) {
      throw new Error(`Spot rate must be positive, got ${params.spotRate}`);
    }
    if (params.strikeRate <= 0) {
      throw new Error(`Strike rate must be positive, got ${params.strikeRate}`);
    }
    if (params.timeToMaturity < 0) {
      throw new Error(`Time to maturity must be non-negative, got ${params.timeToMaturity}`);
    }
    if (params.volatility <= 0) {
      throw new Error(`Volatility must be positive, got ${params.volatility}`);
    }
  }
}
