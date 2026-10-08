import { LiCopulaPairParams, LiCopulaResult } from './li-copula-types';
import { LiCopulaMath } from './li-copula-math';

export class LiCopulaEngine {
  /**
   * Calculates joint default probability and correlation structure using Li's Gaussian Copula (2000).
   *
   * 1. Marginal default probability: F_i(T) = 1 - exp(-lambda_i * T)
   * 2. Equivalent standard normal quantile: z_i = Phi^{-1}(F_i(T))
   * 3. Joint default probability: P(tau1 <= T, tau2 <= T) = C(F_1(T), F_2(T); rho) = Phi_2(z_1, z_2; rho)
   * 4. Default correlation between binary default indicators:
   *    Corr(1_{tau1<=T}, 1_{tau2<=T}) = (P_12 - P_1 * P_2) / sqrt(P_1 * (1 - P_1) * P_2 * (1 - P_2))
   */
  public static calculateBivariateDefault(params: LiCopulaPairParams): LiCopulaResult {
    const { asset1, asset2, timeHorizon: T, assetCorrelation: rho } = params;

    // Bounds check
    const boundedRho = Math.max(-0.9999, Math.min(0.9999, rho));

    // Marginal default probabilities
    const p1 = 1.0 - Math.exp(-asset1.hazardRate * T);
    const p2 = 1.0 - Math.exp(-asset2.hazardRate * T);

    // Inverse standard normal mapping
    const z1 = LiCopulaMath.inverseNormalCdf(p1);
    const z2 = LiCopulaMath.inverseNormalCdf(p2);

    // Joint default probability via Gaussian copula
    const p12 = LiCopulaMath.bivariateNormalCdf(z1, z2, boundedRho);

    // Joint survival probability: P(tau1 > T, tau2 > T) = 1 - P1 - P2 + P12
    const pSurv = Math.max(0.0, 1.0 - p1 - p2 + p12);

    // Default indicator correlation
    const var1 = p1 * (1.0 - p1);
    const var2 = p2 * (1.0 - p2);
    let defCorrelation = 0.0;
    if (var1 > 0 && var2 > 0) {
      defCorrelation = (p12 - p1 * p2) / Math.sqrt(var1 * var2);
    }

    // Expected Portfolio Loss
    // L_i = Notional_i * (1 - RecoveryRate_i) * 1_{default_i}
    const loss1 = asset1.notional * (1.0 - asset1.recoveryRate) * p1;
    const loss2 = asset2.notional * (1.0 - asset2.recoveryRate) * p2;
    const expectedLoss = loss1 + loss2;

    return {
      marginalDefaultProb1: p1,
      marginalDefaultProb2: p2,
      jointDefaultProbability: p12,
      defaultCorrelation: defCorrelation,
      expectedPortfolioLoss: expectedLoss,
      copulaSurvivalProb: pSurv,
    };
  }
}
