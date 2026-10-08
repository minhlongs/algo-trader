import { CholeskySolver, Matrix2x2 } from './cholesky-solver';
import { HasbrouckImpactResult, TradeQuoteObservation, VarCoefficients } from './hasbrouck-types';

export class HasbrouckVarEngine {
  public fitVarAndEstimateImpact(data: TradeQuoteObservation[]): HasbrouckImpactResult {
    const N = data.length;
    if (N < 10) throw new Error('At least 10 observations required for Hasbrouck VAR');

    // Regression design matrix: [r_t, x_t] on [r_{t-1}, x_{t-1}]
    let sRR = 0, sRX = 0, sXX = 0;
    let sY1R = 0, sY1X = 0, sY2R = 0, sY2X = 0;

    for (let t = 1; t < N; t++) {
      const prev = data[t - 1]!;
      const curr = data[t]!;
      const rLag = prev.midquoteReturnBps;
      const xLag = prev.signedTrade;

      sRR += rLag * rLag;
      sRX += rLag * xLag;
      sXX += xLag * xLag;

      sY1R += curr.midquoteReturnBps * rLag;
      sY1X += curr.midquoteReturnBps * xLag;
      sY2R += curr.signedTrade * rLag;
      sY2X += curr.signedTrade * xLag;
    }

    const detX = sRR * sXX - sRX * sRX + 1e-9;
    const invX00 = sXX / detX;
    const invX01 = -sRX / detX;
    const invX11 = sRR / detX;

    const a1 = sY1R * invX00 + sY1X * invX01;
    const b1 = sY1R * invX01 + sY1X * invX11;
    const c1 = sY2R * invX00 + sY2X * invX01;
    const d1 = sY2R * invX01 + sY2X * invX11;

    // Residual covariance computation
    let varE1 = 0, varE2 = 0, covE12 = 0;
    for (let t = 1; t < N; t++) {
      const prev = data[t - 1]!;
      const curr = data[t]!;
      const e1 = curr.midquoteReturnBps - (a1 * prev.midquoteReturnBps + b1 * prev.signedTrade);
      const e2 = curr.signedTrade - (c1 * prev.midquoteReturnBps + d1 * prev.signedTrade);
      varE1 += e1 * e1;
      varE2 += e2 * e2;
      covE12 += e1 * e2;
    }

    const nMinus1 = N - 1;
    const sig1Sq = varE1 / nMinus1;
    const sig2Sq = varE2 / nMinus1;
    const sig12 = covE12 / nMinus1;

    // Lower triangular Cholesky: Trade first (structural shock to trade x_t affects quote r_t)
    // Sigma = [ [sig1Sq, sig12], [sig12, sig2Sq] ]
    const chol = CholeskySolver.cholesky2x2(sig2Sq, sig12, sig1Sq);

    // VAR companion matrix A: [[d1, c1], [b1, a1]] in trade-first coordinate order
    // Invert (I - A)
    const eyeMinusA: Matrix2x2 = {
      m00: 1.0 - d1,
      m01: -c1,
      m10: -b1,
      m11: 1.0 - a1,
    };
    const invEyeMinusA = CholeskySolver.invert2x2(eyeMinusA);

    // Cumulative impulse response: Psi(1) = (I - A)^(-1) * L
    const psi1 = CholeskySolver.multiply2x2(invEyeMinusA, chol);

    // Permanent impact on quote from unit structural trade shock: Psi(1)_{quote, trade} = psi1.m10
    const permImpact = psi1.m10;
    // Transitory spread: initial response minus permanent response
    const immediateImpact = chol.m10;
    const transitorySpread = immediateImpact - permImpact;

    // Variance decomposition:
    // Long-run price innovation variance: sigma_w^2 = [Psi(1) * Psi(1)^T]_{quote, quote}
    const sigWTradeSq = psi1.m10 * psi1.m10;
    const sigWQuoteSq = psi1.m11 * psi1.m11;
    const totalSigWSq = sigWTradeSq + sigWQuoteSq;
    const infoShare = totalSigWSq > 1e-12 ? (sigWTradeSq / totalSigWSq) * 100.0 : 0.0;

    return {
      permanentPriceImpactBps: Number(permImpact.toFixed(4)),
      transitorySpreadBps: Number(transitorySpread.toFixed(4)),
      tradeInformationSharePct: Number(infoShare.toFixed(2)),
      longRunInnovationVariance: Number(totalSigWSq.toFixed(6)),
      residualCovariance: {
        sigmaQuote: Number(Math.sqrt(sig1Sq).toFixed(4)),
        sigmaTrade: Number(Math.sqrt(sig2Sq).toFixed(4)),
        correlation: Number((sig12 / (Math.sqrt(sig1Sq * sig2Sq) + 1e-12)).toFixed(4)),
      },
      sampleCount: N,
    };
  }
}
