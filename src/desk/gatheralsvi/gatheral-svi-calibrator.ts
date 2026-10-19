/**
 * Gatheral (2004) SVI Quasi-Explicit Smile Calibrator
 *
 * Calibrates raw SVI parameters (a, b, rho, m, sigma) to market implied volatility
 * quotes using quasi-explicit least-squares regression combined with non-linear grid optimization.
 *
 * @module desk/gatheralsvi/gatheral-svi-calibrator
 */

import {
  computeSviImpliedVol,
  computeSviTotalVariance,
  evaluateArbitrageConditions,
} from './gatheral-svi-formula';
import type {
  SviCalibrationPoint,
  SviFitResult,
  SviRawParameters,
} from './gatheral-svi-types';

/** Calibrate SVI smile across market strikes */
export function calibrateSviSlice(
  points: SviCalibrationPoint[],
  timeToMaturity: number,
): SviFitResult {
  if (points.length < 3) {
    throw new Error('At least 3 calibration points required for SVI calibration');
  }
  if (timeToMaturity <= 0) {
    throw new Error('Time to maturity must be positive');
  }

  // Convert market vol to market total variance: w_obs = sigma_market^2 * T
  const marketW = points.map((p) => p.marketVol * p.marketVol * timeToMaturity);
  const ks = points.map((p) => p.logMoneyness);

  // Range of exploration for (m, sigma)
  const minK = Math.min(...ks);
  const maxK = Math.max(...ks);
  const mCandidates = [minK * 0.5, 0.0, maxK * 0.5];
  const sigmaCandidates = [0.05, 0.1, 0.2, 0.4];

  let bestParams: SviRawParameters = {
    a: 0.04 * timeToMaturity,
    b: 0.1,
    rho: -0.2,
    m: 0.0,
    sigma: 0.1,
  };
  let bestMse = Infinity;

  // Grid sweep over non-linear shape parameters (m, sigma)
  for (const m of mCandidates) {
    for (const sigma of sigmaCandidates) {
      // Linear regression / bounded search for (a, b, rho)
      for (const rho of [-0.6, -0.3, 0.0, 0.3]) {
        for (const b of [0.05, 0.1, 0.2, 0.35]) {
          // Find optimal intercept a: average difference between observed and uncentered SVI term
          let sumDiff = 0;
          for (let i = 0; i < points.length; i++) {
            const km = ks[i] - m;
            const root = Math.sqrt(km * km + sigma * sigma);
            const basis = b * (rho * km + root);
            sumDiff += marketW[i] - basis;
          }
          const a = Math.max(0.0001, sumDiff / points.length);

          // Evaluate MSE
          const cand: SviRawParameters = { a, b, rho, m, sigma };
          let mse = 0;
          for (let i = 0; i < points.length; i++) {
            const modelW = computeSviTotalVariance(ks[i], cand);
            const err = modelW - marketW[i];
            mse += err * err;
          }
          mse /= points.length;

          if (mse < bestMse) {
            bestMse = mse;
            bestParams = cand;
          }
        }
      }
    }
  }

  // Compute RMSE in vol space
  let sseVol = 0;
  for (let i = 0; i < points.length; i++) {
    const modelVol = computeSviImpliedVol(ks[i], timeToMaturity, bestParams);
    const err = modelVol - points[i].marketVol;
    sseVol += err * err;
  }
  const rmseVol = Math.sqrt(sseVol / points.length);

  const diag = evaluateArbitrageConditions(bestParams, timeToMaturity);

  return {
    params: bestParams,
    timeToMaturity,
    mse: bestMse,
    rmseVol,
    arbitrageDiagnostics: diag,
    pointCount: points.length,
  };
}
