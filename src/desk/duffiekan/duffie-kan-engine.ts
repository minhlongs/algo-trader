import { DuffieKanParams, DuffieKanResult } from './duffie-kan-types.js';
import { DuffieKanMath } from './duffie-kan-math.js';

export class DuffieKanEngine {
  public static validate(params: DuffieKanParams): void {
    const dim = params.speedK.length;
    if (dim === 0) {
      throw new Error('Dimension of state variables must be at least 1.');
    }
    if (
      params.theta.length !== dim ||
      params.sigma.length !== dim ||
      params.delta1.length !== dim ||
      params.stateX.length !== dim
    ) {
      throw new Error('Inconsistent dimension among affine parameters.');
    }
    if (params.maturity <= 0) {
      throw new Error('Maturity must be strictly positive.');
    }
    for (let i = 0; i < dim; i++) {
      if (params.speedK[i] <= 0) throw new Error('Mean reversion speed K must be positive.');
      if (params.sigma[i] < 0) throw new Error('Volatility sigma must be non-negative.');
    }
    if (params.creditDelta1 && params.creditDelta1.length !== dim) {
      throw new Error('Credit delta1 dimension must match state variables.');
    }
  }

  public static price(params: DuffieKanParams): DuffieKanResult {
    this.validate(params);
    const { speedK, theta, sigma, delta0, delta1, stateX, maturity } = params;

    const riskless = DuffieKanMath.solveRiccati(speedK, theta, sigma, delta0, delta1, maturity);
    const bondPrice = DuffieKanMath.calculatePrice(riskless.A, riskless.B, stateX);
    const risklessYield = DuffieKanMath.calculateYield(bondPrice, maturity);

    let creditSpreadBps = 0;
    let defaultablePrice: number | undefined;

    if (params.creditDelta0 !== undefined || params.creditDelta1 !== undefined) {
      const lam0 = params.creditDelta0 ?? 0;
      const lam1 = params.creditDelta1 ?? new Array<number>(speedK.length).fill(0);
      const lossGivenDefault = 1.0 - (params.recoveryRate ?? 0.4);

      const totalDelta0 = delta0 + lossGivenDefault * lam0;
      const totalDelta1 = delta1.map((d1, i) => d1 + lossGivenDefault * lam1[i]);

      const defSol = DuffieKanMath.solveRiccati(speedK, theta, sigma, totalDelta0, totalDelta1, maturity);
      defaultablePrice = DuffieKanMath.calculatePrice(defSol.A, defSol.B, stateX);
      const defYield = DuffieKanMath.calculateYield(defaultablePrice, maturity);
      creditSpreadBps = Math.max(0, (defYield - risklessYield) * 10000);
    }

    return {
      bondPrice,
      yieldToMaturity: risklessYield,
      risklessYield,
      creditSpreadBps,
      coefficientsA: riskless.A,
      coefficientsB: riskless.B,
      defaultablePrice,
    };
  }

  public static termStructure(
    params: DuffieKanParams,
    maturities: number[]
  ): Array<{ maturity: number; yield: number; creditSpreadBps: number }> {
    return maturities.map(mat => {
      const res = this.price({ ...params, maturity: mat });
      return {
        maturity: mat,
        yield: res.yieldToMaturity,
        creditSpreadBps: res.creditSpreadBps,
      };
    });
  }
}
