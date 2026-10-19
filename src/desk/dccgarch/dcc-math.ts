/**
 * Mathematical calculations for Engle (2002) DCC-GARCH.
 * Strictly < 180 LOC, zero :any types.
 */

import { DccParams, DccStepPoint } from './dcc-types';

export function computeUnconditionalCorrelation(
  standardizedResiduals: readonly (readonly number[])[]
): number[][] {
  const tCount = standardizedResiduals.length;
  if (tCount === 0) return [];
  const k = standardizedResiduals[0].length;

  const qBar: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let t = 0; t < tCount; t++) {
    const z = standardizedResiduals[t];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        qBar[i][j] += z[i] * z[j];
      }
    }
  }

  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      qBar[i][j] /= tCount;
    }
  }

  // Normalize to pure correlation matrix
  const rBar: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const denom = Math.sqrt(Math.max(1e-8, qBar[i][i] * qBar[j][j]));
      rBar[i][j] = Math.max(-1, Math.min(1, qBar[i][j] / denom));
    }
  }
  return rBar;
}

export function evaluateDccSeries(
  standardizedResiduals: readonly (readonly number[])[],
  volatilities: readonly (readonly number[])[],
  params: DccParams,
  qBar: readonly (readonly number[])[]
): readonly DccStepPoint[] {
  const tCount = standardizedResiduals.length;
  if (tCount === 0) return [];
  const k = standardizedResiduals[0].length;

  const points: DccStepPoint[] = [];
  let currentQ: number[][] = qBar.map((row) => [...row]);
  const omegaWeight = 1.0 - params.alpha - params.beta;

  for (let t = 0; t < tCount; t++) {
    const zPrev = t > 0 ? standardizedResiduals[t - 1] : standardizedResiduals[0];

    // Q_t = (1 - alpha - beta)*Q_bar + alpha * (z_{t-1} z_{t-1}^T) + beta * Q_{t-1}
    const nextQ: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const outerZ = zPrev[i] * zPrev[j];
        nextQ[i][j] =
          omegaWeight * qBar[i][j] +
          params.alpha * outerZ +
          params.beta * currentQ[i][j];
      }
    }
    currentQ = nextQ;

    // Rescale Q to correlation matrix R: R_ij = Q_ij / sqrt(Q_ii * Q_jj)
    const R: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (i === j) {
          R[i][j] = 1.0;
        } else {
          const denom = Math.sqrt(Math.max(1e-8, currentQ[i][i] * currentQ[j][j]));
          R[i][j] = Math.max(-0.999, Math.min(0.999, currentQ[i][j] / denom));
        }
      }
    }

    // Dynamic Covariance H_t = D_t * R_t * D_t
    const vols = volatilities[t] ?? Array(k).fill(1.0);
    const H: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        H[i][j] = vols[i] * vols[j] * R[i][j];
      }
    }

    const pairCorrelations: { assetI: number; assetJ: number; correlation: number }[] = [];
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        pairCorrelations.push({ assetI: i, assetJ: j, correlation: R[i][j] });
      }
    }

    // Minimum variance hedge ratio: H_12 / H_22
    const h22 = H[1] && H[1][1] ? H[1][1] : 1.0;
    const h12 = H[0] && H[0][1] ? H[0][1] : 0.0;
    const dynamicHedgeRatio12 = h12 / Math.max(1e-8, h22);

    points.push({
      t,
      correlationMatrix: R,
      covarianceMatrix: H,
      pairCorrelations,
      dynamicHedgeRatio12,
    });
  }

  return points;
}

export function computeDccLogLikelihood2D(
  standardizedResiduals: readonly (readonly number[])[],
  points: readonly DccStepPoint[]
): number {
  let totalLl = 0;
  const tCount = points.length;

  for (let t = 0; t < tCount; t++) {
    const z = standardizedResiduals[t];
    const rho = points[t].correlationMatrix[0][1];
    const detR = Math.max(1e-6, 1.0 - rho * rho);
    const invR00 = 1.0 / detR;
    const invR01 = -rho / detR;
    const invR11 = 1.0 / detR;

    // z^T R^{-1} z
    const zRinvZ =
      z[0] * (invR00 * z[0] + invR01 * z[1]) +
      z[1] * (invR01 * z[0] + invR11 * z[1]);
    const zTz = z[0] * z[0] + z[1] * z[1];

    // Quasi-correlation log-likelihood: -0.5 * (ln(|R|) + z^T R^{-1} z - z^T z)
    const ll_t = -0.5 * (Math.log(detR) + zRinvZ - zTz);
    if (Number.isFinite(ll_t)) {
      totalLl += ll_t;
    }
  }

  return totalLl;
}
