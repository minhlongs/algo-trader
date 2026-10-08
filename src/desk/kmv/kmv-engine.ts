import { KmvParams, KmvResult } from './kmv-types';
import { KmvMath } from './kmv-math';

export class KmvEngine {
  public static calculate(params: KmvParams): KmvResult {
    const { equityValue: E, equityVolatility: sigmaE, debtFaceValue: D, timeHorizon: T, riskFreeRate: r } = params;

    if (E <= 0 || sigmaE <= 0 || D <= 0 || T <= 0) {
      throw new Error('Equity value, volatility, debt face value, and time horizon must be strictly positive');
    }

    const mu = params.assetDrift !== undefined ? params.assetDrift : r;

    // Simultaneous solver for unobserved (V, sigmaV)
    let V = E + D * Math.exp(-r * T);
    let sigmaV = (sigmaE * E) / V;
    let iter = 0;
    const maxIter = 100;
    const tol = 1e-7;

    for (iter = 0; iter < maxIter; iter++) {
      const { value: callVal, d1 } = KmvMath.calcCall(V, D, T, r, sigmaV);
      const nd1 = KmvMath.normalCdf(d1);

      // Objective f1: callVal - E = 0
      const f1 = callVal - E;
      // Objective f2: nd1 * sigmaV * V - sigmaE * E = 0
      const f2 = nd1 * sigmaV * V - sigmaE * E;

      if (Math.abs(f1) < tol && Math.abs(f2) < tol) {
        break;
      }

      // Derivative d(callVal)/dV = nd1
      // Update V via Newton step on f1
      const dV = f1 / Math.max(1e-5, nd1);
      V = Math.max(E, V - dV);

      // Update sigmaV from second equation
      const newSigmaV = (sigmaE * E) / Math.max(1e-6, KmvMath.normalCdf(KmvMath.calcD1(V, D, T, r, sigmaV)) * V);
      sigmaV = 0.5 * sigmaV + 0.5 * Math.max(0.001, newSigmaV);
    }

    // Physical distance to default (DD) under real-world drift mu
    const dd = (Math.log(V / D) + (mu - 0.5 * sigmaV * sigmaV) * T) / (sigmaV * Math.sqrt(T));
    const edf = KmvMath.normalCdf(-dd);

    // Risky debt valuation B = V - E
    const riskyDebtValue = Math.max(0.0, V - E);
    const debtYield = -Math.log(riskyDebtValue / D) / T;
    const creditSpreadBps = Math.max(0.0, (debtYield - r) * 10000.0);
    const leverageRatio = (D * Math.exp(-r * T)) / V;

    return {
      assetValue: V,
      assetVolatility: sigmaV,
      distanceToDefault: dd,
      expectedDefaultFrequency: edf,
      riskyDebtValue,
      creditSpreadBps,
      leverageRatio,
      iterations: iter,
    };
  }
}
