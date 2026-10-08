import { BlackCoxParams, BlackCoxResult } from './black-cox-types';
import { BlackCoxMath } from './black-cox-math';

export class BlackCoxEngine {
  /**
   * Evaluates first-passage structural credit risk according to the Black & Cox (1976) model.
   * Barrier is given by C(t) = K * exp(-gamma * (T - t)).
   * Firm defaults at first tau <= T such that V(tau) <= C(tau).
   */
  public static calculate(params: BlackCoxParams): BlackCoxResult {
    const { assetValue: V0, defaultThreshold: K, growthRate: r, volatility: sigma, barrierDiscountRate: gamma, timeHorizon: T, recoveryRate: R } = params;

    if (V0 <= 0 || K <= 0 || sigma <= 0 || T <= 0) {
      throw new Error('Asset value, threshold, volatility, and horizon must be positive');
    }

    // If initial asset is already below or at initial barrier level C(0) = K * exp(-gamma * T)
    const initialBarrier = K * Math.exp(-gamma * T);
    if (V0 <= initialBarrier) {
      return {
        survivalProbability: 0.0,
        defaultProbability: 1.0,
        expectedRecoveryValue: R * K,
        creditSpreadBps: 10000.0,
        firstPassageDensityAtT: 0.0,
      };
    }

    // Transformation parameters:
    // y0 = ln(V0 / initialBarrier) = ln(V0 / K) + gamma * T
    const y0 = Math.log(V0 / K) + gamma * T;
    // Drift under transformation: mu = (r - gamma) - 0.5 * sigma^2
    const mu = (r - gamma) - 0.5 * sigma * sigma;
    const sqrtT = Math.sqrt(T);

    // Standard analytical formula for hitting time of Brownian motion with drift:
    // P(tau > T) = Phi( (y0 + mu*T) / (sigma*sqrtT) ) - exp(-2*mu*y0 / sigma^2) * Phi( (-y0 + mu*T) / (sigma*sqrtT) )
    const d1 = (y0 + mu * T) / (sigma * sqrtT);
    const d2 = (-y0 + mu * T) / (sigma * sqrtT);

    const scaleFactor = Math.exp(-2.0 * mu * y0 / (sigma * sigma));
    const term1 = BlackCoxMath.normalCdf(d1);
    const term2 = scaleFactor * BlackCoxMath.normalCdf(d2);

    const survivalProb = Math.max(0.0, Math.min(1.0, term1 - term2));
    const defaultProb = 1.0 - survivalProb;

    // Density g(T) = (y0 / (sqrt(2*pi*sigma^2*T^3))) * exp( -(y0 + mu*T)^2 / (2*sigma^2*T) )
    const denomDensity = Math.sqrt(2.0 * Math.PI * sigma * sigma * Math.pow(T, 3));
    const densityAtT = denomDensity > 0
      ? (y0 / denomDensity) * Math.exp(-Math.pow(y0 + mu * T, 2) / (2.0 * sigma * sigma * T))
      : 0.0;

    // Zero-coupon defaultable bond price with recovery:
    // P_def = exp(-r*T) * survivalProb + R * exp(-r*T) * defaultProb
    const zcbRiskFree = Math.exp(-r * T);
    const zcbDefaultable = zcbRiskFree * (survivalProb + R * defaultProb);
    const yieldDef = -Math.log(zcbDefaultable) / T;
    const creditSpreadBps = Math.max(0.0, (yieldDef - r) * 10000.0);

    return {
      survivalProbability: survivalProb,
      defaultProbability: defaultProb,
      expectedRecoveryValue: R * K * defaultProb,
      creditSpreadBps,
      firstPassageDensityAtT: densityAtT,
    };
  }
}
