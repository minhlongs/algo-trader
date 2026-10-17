/**
 * Joel Hasbrouck (1991) VAR / VECM Empirical Microstructure Engine.
 * Implements Bivariate VAR(K) estimation, Wold moving average representation,
 * Impulse Response Function (IRF), and Information Share (R_w^2) variance decomposition.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  HasbrouckTradeObservation,
  HasbrouckVarConfig,
  HasbrouckVarCoefficients,
  HasbrouckResiduals,
  HasbrouckImpulseResponseStep,
  HasbrouckVarianceDecomposition,
  HasbrouckVecmAnalysisResult,
} from './hasbrouck-vecm-types.js';
import { HasbrouckVecmMath } from './hasbrouck-vecm-math.js';

export class HasbrouckVecmEngine {
  public static validate(obs: readonly HasbrouckTradeObservation[], cfg: HasbrouckVarConfig): void {
    if (cfg.lagOrder < 1) throw new Error('Lag order must be at least 1');
    if (obs.length <= cfg.lagOrder + 2) {
      throw new Error(`Insufficient observations (${obs.length}) for lag order ${cfg.lagOrder}`);
    }
  }

  /**
   * Estimates Bivariate VAR(K) for midpoint return r_t and signed trade flow x_t.
   */
  public static estimate(
    obs: readonly HasbrouckTradeObservation[],
    cfg: HasbrouckVarConfig,
    irfHorizon = 20
  ): HasbrouckVecmAnalysisResult {
    this.validate(obs, cfg);
    const K = cfg.lagOrder;
    const ridge = cfg.ridgePenalty ?? 1e-7;
    const T = obs.length - K;

    const X: number[][] = [];
    const yR: number[] = [];
    const yX: number[] = [];

    for (let t = K; t < obs.length; t++) {
      const row: number[] = [1.0];
      for (let lag = 1; lag <= K; lag++) row.push(obs[t - lag].midpointReturn);
      for (let lag = 1; lag <= K; lag++) row.push(obs[t - lag].signedVolume);
      X.push(row);
      yR.push(obs[t].midpointReturn);
      yX.push(obs[t].signedVolume);
    }

    const bR = HasbrouckVecmMath.solveOlsWithRidge(X, yR, ridge);
    const bX = HasbrouckVecmMath.solveOlsWithRidge(X, yX, ridge);

    const coefficients: HasbrouckVarCoefficients = {
      alphaLagMidpoint: bR.slice(1, 1 + K),
      alphaLagSignedTrade: bR.slice(1 + K, 1 + 2 * K),
      betaLagMidpoint: bX.slice(1, 1 + K),
      betaLagSignedTrade: bX.slice(1 + K, 1 + 2 * K),
      interceptMidpoint: bR[0],
      interceptTrade: bX[0],
    };

    const v1: number[] = [];
    const v2: number[] = [];
    for (let i = 0; i < T; i++) {
      let pR = 0;
      let pX = 0;
      for (let j = 0; j < X[i].length; j++) {
        pR += X[i][j] * bR[j];
        pX += X[i][j] * bX[j];
      }
      v1.push(yR[i] - pR);
      v2.push(yX[i] - pX);
    }

    const cov = HasbrouckVecmMath.computeResidualCovariance(v1, v2);
    const residuals: HasbrouckResiduals = {
      midpointInnovations: v1,
      tradeInnovations: v2,
      sigma1Sq: cov.sigma1Sq,
      sigma2Sq: cov.sigma2Sq,
      cov12: cov.cov12,
    };

    const impulseResponses = this.computeImpulseResponses(coefficients, irfHorizon);
    const varianceDecomposition = this.computeVarianceDecomposition(impulseResponses, residuals);

    return {
      config: cfg,
      sampleSize: obs.length,
      coefficients,
      residuals,
      impulseResponses,
      varianceDecomposition,
    };
  }

  /**
   * Computes Wold moving average representation and IRF through forward recursion.
   */
  public static computeImpulseResponses(
    coef: HasbrouckVarCoefficients,
    horizon: number
  ): readonly HasbrouckImpulseResponseStep[] {
    const K = coef.alphaLagMidpoint.length;
    const steps: HasbrouckImpulseResponseStep[] = [];
    const tR = Array(horizon + K + 1).fill(0);
    const tX = Array(horizon + K + 1).fill(0);
    const qR = Array(horizon + K + 1).fill(0);
    const qX = Array(horizon + K + 1).fill(0);
    tX[K] = 1.0;
    qR[K] = 1.0;

    let cumTQ = 0;
    let cumQQ = 0;

    for (let tau = 0; tau <= horizon; tau++) {
      const idx = K + tau;
      if (tau > 0) {
        let rT = 0;
        let xT = 0;
        let rQ = 0;
        let xQ = 0;
        for (let lag = 1; lag <= K; lag++) {
          rT += coef.alphaLagMidpoint[lag - 1] * tR[idx - lag] + coef.alphaLagSignedTrade[lag - 1] * tX[idx - lag];
          xT += coef.betaLagMidpoint[lag - 1] * tR[idx - lag] + coef.betaLagSignedTrade[lag - 1] * tX[idx - lag];
          rQ += coef.alphaLagMidpoint[lag - 1] * qR[idx - lag] + coef.alphaLagSignedTrade[lag - 1] * qX[idx - lag];
          xQ += coef.betaLagMidpoint[lag - 1] * qR[idx - lag] + coef.betaLagSignedTrade[lag - 1] * qX[idx - lag];
        }
        tR[idx] = rT;
        tX[idx] = xT;
        qR[idx] = rQ;
        qX[idx] = xQ;
      }
      cumTQ += tR[idx];
      cumQQ += qR[idx];
      steps.push({
        horizon: tau,
        tradeShockToReturn: tR[idx],
        tradeShockToQuote: cumTQ,
        quoteShockToReturn: qR[idx],
        quoteShockToQuote: cumQQ,
      });
    }
    return steps;
  }

  /**
   * Hasbrouck (1991) Information Share (R_w^2) and permanent price impact.
   */
  public static computeVarianceDecomposition(
    irf: readonly HasbrouckImpulseResponseStep[],
    residuals: HasbrouckResiduals
  ): HasbrouckVarianceDecomposition {
    const finalStep = irf[irf.length - 1];
    const impTrade = finalStep.tradeShockToQuote;
    const impQuote = finalStep.quoteShockToQuote;

    const chol = HasbrouckVecmMath.cholesky2x2(residuals.sigma2Sq, residuals.sigma1Sq, residuals.cov12);
    const tradeVarComp = Math.pow(impTrade * chol.l11 + impQuote * chol.l21, 2);
    const quoteVarComp = Math.pow(impQuote * chol.l22, 2);
    const totalRwVar = Math.max(1e-12, tradeVarComp + quoteVarComp);

    return {
      totalRandomWalkVariance: totalRwVar,
      tradeInformationVariance: tradeVarComp,
      quoteInformationVariance: quoteVarComp,
      informationShare: Math.min(1.0, Math.max(0.0, tradeVarComp / totalRwVar)),
      permanentPriceImpact: impTrade,
    };
  }
}
