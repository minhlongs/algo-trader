import { CrankOptionParams, CrankResult, CrankGreeks } from './crank-types.js';
import { CrankMath } from './crank-math.js';

export class CrankEngine {
  public static validate(params: CrankOptionParams): void {
    if (params.spot <= 0) throw new Error('Spot must be strictly positive');
    if (params.strike <= 0) throw new Error('Strike must be strictly positive');
    if (params.timeToExpiry <= 0) throw new Error('Time to expiry must be strictly positive');
    if (params.volatility <= 0) throw new Error('Volatility must be strictly positive');
  }

  public static price(params: CrankOptionParams): CrankResult {
    this.validate(params);
    const price = this.solvePrice(params);
    const europeanPrice = params.isAmerican
      ? this.solvePrice({ ...params, isAmerican: false })
      : price;
    const earlyExercisePremium = params.isAmerican ? Math.max(0, price - europeanPrice) : 0;
    const greeks = this.calculateGreeks(params, price);

    return {
      price,
      earlyExercisePremium,
      greeks,
      gridNodes: params.gridStepsS ?? 200,
      timeSteps: params.gridStepsT ?? 200,
    };
  }

  public static solvePrice(params: CrankOptionParams): number {
    this.validate(params);
    const { spot, strike, timeToExpiry: T, riskFreeRate: r, dividendYield: q, volatility: sigma, isCall, isAmerican } = params;

    const M = params.gridStepsS ?? 200;
    const N = params.gridStepsT ?? 200;

    const Smax = 3.5 * Math.max(spot, strike);
    const dS = Smax / M;
    const dt = T / N;

    const S = Array.from({ length: M + 1 }, (_, i) => i * dS);
    const intrinsic = S.map(s => isCall ? Math.max(0, s - strike) : Math.max(0, strike - s));

    let V = [...intrinsic];

    const alpha: number[] = Array(M - 1).fill(0);
    const beta: number[] = Array(M - 1).fill(0);
    const gamma: number[] = Array(M - 1).fill(0);

    for (let i = 1; i < M; i++) {
      const idx = i - 1;
      alpha[idx] = 0.25 * dt * (sigma * sigma * i * i - (r - q) * i);
      beta[idx] = -0.5 * dt * (sigma * sigma * i * i + r);
      gamma[idx] = 0.25 * dt * (sigma * sigma * i * i + (r - q) * i);
    }

    const lhsSub = alpha.slice(1).map(v => -v);
    const lhsDiag = beta.map(v => 1 - v);
    const lhsSuper = gamma.slice(0, -1).map(v => -v);

    for (let step = 0; step < N; step++) {
      const rhs = Array(M - 1).fill(0);

      const v0_next = isCall ? 0 : strike * Math.exp(-r * (step + 1) * dt);
      const vM_next = isCall ? (Smax - strike * Math.exp(-r * (step + 1) * dt)) : 0;

      for (let i = 1; i < M; i++) {
        const idx = i - 1;
        let val = (1 + beta[idx]) * V[i] + alpha[idx] * V[i - 1] + gamma[idx] * V[i + 1];
        if (i === 1) val += alpha[idx] * v0_next;
        if (i === M - 1) val += gamma[idx] * vM_next;
        rhs[idx] = val;
      }

      const intPoints = isAmerican ? intrinsic.slice(1, M) : undefined;
      const vInterior = CrankMath.solveTridiagonal(lhsSub, lhsDiag, lhsSuper, rhs, intPoints);

      V = [v0_next, ...vInterior, vM_next];
    }

    const sIdx = Math.floor(spot / dS);
    const weight = (spot - S[sIdx]) / dS;
    const interpolated = V[sIdx] * (1 - weight) + V[sIdx + 1] * weight;
    const spotIntrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);

    return isAmerican ? Math.max(spotIntrinsic, interpolated) : interpolated;
  }

  private static calculateGreeks(params: CrankOptionParams, basePrice: number): CrankGreeks {
    const hS = params.spot * 0.01;
    const pUp = this.solvePrice({ ...params, spot: params.spot + hS });
    const pDown = this.solvePrice({ ...params, spot: params.spot - hS });
    const delta = (pUp - pDown) / (2 * hS);
    const gamma = (pUp - 2 * basePrice + pDown) / (hS * hS);

    const hV = 0.01;
    const pVUp = this.solvePrice({ ...params, volatility: params.volatility + hV });
    const vega = (pVUp - basePrice) / hV;

    const hT = 1 / 365;
    const pTDown = params.timeToExpiry > hT
      ? this.solvePrice({ ...params, timeToExpiry: params.timeToExpiry - hT })
      : basePrice;
    const theta = (pTDown - basePrice) / hT;

    const hR = 0.001;
    const pRUp = this.solvePrice({ ...params, riskFreeRate: params.riskFreeRate + hR });
    const rho = (pRUp - basePrice) / hR;

    return { delta, gamma, vega, theta, rho };
  }
}
