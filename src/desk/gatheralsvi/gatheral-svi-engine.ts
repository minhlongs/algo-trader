/**
 * Gatheral (2004) SVI Smile Calibration & Volatility Interpolator Engine
 *
 * High-level engine for fitting market smiles across strikes, interpolating implied volatility,
 * and checking absence of butterfly / calendar arbitrage.
 *
 * @module desk/gatheralsvi/gatheral-svi-engine
 */

import { calibrateSviSlice } from './gatheral-svi-calibrator';
import {
  computeDurrlemanG,
  computeSviFirstDerivative,
  computeSviImpliedVol,
  computeSviSecondDerivative,
  computeSviTotalVariance,
  evaluateArbitrageConditions,
} from './gatheral-svi-formula';
import type {
  SviArbitrageDiagnostics,
  SviCalibrationPoint,
  SviFitResult,
  SviRawParameters,
} from './gatheral-svi-types';

export class GatheralSviEngine {
  private fitResult?: SviFitResult;

  constructor(
    public readonly timeToMaturity: number,
    public readonly forward: number = 100,
  ) {
    if (timeToMaturity <= 0) throw new Error('Time to maturity must be positive');
    if (forward <= 0) throw new Error('Forward price must be positive');
  }

  /** Fit SVI to discrete calibration points */
  fit(points: SviCalibrationPoint[]): SviFitResult {
    this.fitResult = calibrateSviSlice(points, this.timeToMaturity);
    return this.fitResult;
  }

  /** Fit from raw market strikes and implied volatilities */
  fitFromStrikes(strikes: number[], marketVols: number[]): SviFitResult {
    if (strikes.length !== marketVols.length) {
      throw new Error('Strikes and vols array lengths must match');
    }
    const points: SviCalibrationPoint[] = strikes.map((K, i) => ({
      logMoneyness: Math.log(K / this.forward),
      marketVol: marketVols[i],
    }));
    return this.fit(points);
  }

  /** Get current fitted model */
  getModel(): SviFitResult {
    if (!this.fitResult) {
      throw new Error('SVI model must be fitted first via fit() or fitFromStrikes()');
    }
    return this.fitResult;
  }

  /** Get calibrated raw parameters */
  getParameters(): SviRawParameters {
    return this.getModel().params;
  }

  /** Interpolate implied volatility at an arbitrary strike */
  getImpliedVolAtStrike(strike: number): number {
    if (strike <= 0) throw new Error('Strike must be positive');
    const k = Math.log(strike / this.forward);
    return computeSviImpliedVol(k, this.timeToMaturity, this.getParameters());
  }

  /** Interpolate implied volatility at log-moneyness k */
  getImpliedVolAtLogMoneyness(k: number): number {
    return computeSviImpliedVol(k, this.timeToMaturity, this.getParameters());
  }

  /** Get total variance w(k) at log-moneyness */
  getTotalVariance(k: number): number {
    return computeSviTotalVariance(k, this.getParameters());
  }

  /** Compute skew slope dw/dk */
  getSkewSlope(k: number): number {
    return computeSviFirstDerivative(k, this.getParameters());
  }

  /** Compute curvature d^2w/dk^2 */
  getCurvature(k: number): number {
    return computeSviSecondDerivative(k, this.getParameters());
  }

  /** Check Durrleman butterfly arbitrage at log-moneyness */
  getDurrlemanG(k: number): number {
    return computeDurrlemanG(k, this.getParameters());
  }

  /** Run comprehensive arbitrage diagnostics */
  runDiagnostics(): SviArbitrageDiagnostics {
    return evaluateArbitrageConditions(this.getParameters(), this.timeToMaturity);
  }
}
