import { HestonParams, HestonPricingResult, HestonGreeks } from './heston-types.js';
import { HestonMath } from './heston-math.js';

export class HestonEngine {
  public static validate(params: HestonParams): void {
    if (params.spot <= 0) throw new Error('Spot must be strictly positive');
    if (params.strike <= 0) throw new Error('Strike must be strictly positive');
    if (params.timeToExpiry <= 0) throw new Error('Time to expiry must be positive');
    if (params.v0 <= 0 || params.theta <= 0 || params.kappa <= 0 || params.sigmaV <= 0) {
      throw new Error('Variance parameters (v0, theta, kappa, sigmaV) must be positive');
    }
    if (params.rho < -1 || params.rho > 1) throw new Error('Rho must be within [-1, 1]');
  }

  public static priceCall(params: HestonParams): number {
    this.validate(params);
    const { spot, strike, timeToExpiry: T, riskFreeRate: r, dividendYield: q } = params;
    const P1 = Math.max(0, Math.min(1, HestonMath.calculateProbability(params, 1)));
    const P2 = Math.max(0, Math.min(1, HestonMath.calculateProbability(params, 2)));

    const callPrice = spot * Math.exp(-q * T) * P1 - strike * Math.exp(-r * T) * P2;
    const intrinsic = Math.max(0, spot * Math.exp(-q * T) - strike * Math.exp(-r * T));
    return Math.max(intrinsic, callPrice);
  }

  public static price(params: HestonParams): HestonPricingResult {
    this.validate(params);
    const { spot, strike, timeToExpiry: T, riskFreeRate: r, dividendYield: q, kappa, theta, sigmaV } = params;

    const callPrice = this.priceCall(params);
    const putPrice = callPrice - spot * Math.exp(-q * T) + strike * Math.exp(-r * T);

    const fellerRatio = (2 * kappa * theta) / (sigmaV * sigmaV);
    const fellerSatisfied = fellerRatio > 1.0;

    const greeks = this.calculateGreeks(params, callPrice);

    return {
      callPrice,
      putPrice: Math.max(0, putPrice),
      fellerSatisfied,
      fellerRatio,
      greeks,
    };
  }

  private static calculateGreeks(params: HestonParams, baseCall: number): HestonGreeks {
    const hSpot = params.spot * 0.005;
    const callUpSpot = this.priceCall({ ...params, spot: params.spot + hSpot });
    const callDownSpot = this.priceCall({ ...params, spot: params.spot - hSpot });
    const delta = (callUpSpot - callDownSpot) / (2 * hSpot);
    const gamma = (callUpSpot - 2 * baseCall + callDownSpot) / (hSpot * hSpot);

    const hV = 0.005;
    const callUpV = this.priceCall({ ...params, v0: params.v0 + hV });
    const vega = (callUpV - baseCall) / (Math.sqrt(params.v0 + hV) - Math.sqrt(params.v0));

    const hT = 1 / 365;
    const callT = params.timeToExpiry > hT ? this.priceCall({ ...params, timeToExpiry: params.timeToExpiry - hT }) : baseCall;
    const theta = (callT - baseCall) / hT;

    const hR = 0.0005;
    const callUpR = this.priceCall({ ...params, riskFreeRate: params.riskFreeRate + hR });
    const rho = (callUpR - baseCall) / hR;

    return { delta, gamma, vega, theta, rho };
  }
}
