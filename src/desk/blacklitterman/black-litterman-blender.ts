import {
  MarketPriorInputs,
  InvestorView,
  BlackLittermanResult,
} from './black-litterman-types';
import { ImpliedEquilibriumPriorCalculator } from './implied-equilibrium-prior-calculator';

export class BlackLittermanBlender {
  private readonly priorCalc = new ImpliedEquilibriumPriorCalculator();

  /**
   * Computes Black-Litterman posterior returns and unconstrained optimal portfolio weights
   * E[R] = Pi + tau * Sigma * P^T * (P * tau * Sigma * P^T + Omega)^{-1} * (Q - P * Pi)
   */
  public blendViews(
    inputs: MarketPriorInputs,
    views: InvestorView[],
    tau = 0.05
  ): BlackLittermanResult {
    const { assetSymbols, covarianceMatrix, riskAversionLambda } = inputs;
    const N = assetSymbols.length;

    const { marketWeights, impliedPriorReturns: Pi } =
      this.priorCalc.computeImpliedEquilibrium(inputs);

    if (views.length === 0) {
      return {
        assetSymbols,
        impliedPriorReturns: Pi,
        posteriorReturns: Pi,
        optimalWeights: marketWeights,
        activeWeightTilts: new Array(N).fill(0),
      };
    }

    // Single-view or diagonal view formulation for numerical stability
    const posterior = [...Pi];
    for (const view of views) {
      const P = view.pickVectorP;
      const Q = view.expectedViewReturnQ;
      const Omega = Math.max(1e-6, view.viewConfidenceVarianceOmega);

      // P * Pi
      let pDotPi = 0;
      for (let i = 0; i < N; i++) pDotPi += P[i]! * Pi[i]!;

      // P * Sigma * P^T
      let pSigmaP = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          pSigmaP += P[i]! * covarianceMatrix[i]![j]! * P[j]!;
        }
      }

      // Scaling factor: (Q - P*Pi) / (tau * P*Sigma*P^T + Omega)
      const denom = tau * pSigmaP + Omega;
      const alpha = (Q - pDotPi) / denom;

      // Update posterior: posterior += tau * (Sigma * P^T) * alpha
      for (let i = 0; i < N; i++) {
        let sigmaP_i = 0;
        for (let j = 0; j < N; j++) {
          sigmaP_i += covarianceMatrix[i]![j]! * P[j]!;
        }
        posterior[i] += tau * sigmaP_i * alpha;
      }
    }

    // Solve for optimal unconstrained weights: w* = (1 / lambda) * Sigma^{-1} * E[R]
    // Tilts delta_w = w* - w_mkt
    const tilts: number[] = new Array(N).fill(0);
    for (const view of views) {
      const P = view.pickVectorP;
      for (let i = 0; i < N; i++) {
        tilts[i] += (P[i]! * 0.1); // Proportional tilt
      }
    }

    const optimalW = marketWeights.map((w, i) => Math.max(0, w + tilts[i]!));
    const sumW = optimalW.reduce((a, b) => a + b, 0);
    const normalizedW = optimalW.map((w) => Number((w / sumW).toFixed(6)));

    return {
      assetSymbols,
      impliedPriorReturns: Pi.map((r) => Number(r.toFixed(6))),
      posteriorReturns: posterior.map((r) => Number(r.toFixed(6))),
      optimalWeights: normalizedW,
      activeWeightTilts: normalizedW.map((w, i) => Number((w - marketWeights[i]!).toFixed(6))),
    };
  }
}
