/**
 * Dupire (1994) Surface Engine.
 * Constructs full continuous local volatility grid and surface analysis.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  ArbitrageViolation,
  DupireMarketParams,
  DupireSurfaceResult,
  LocalVolPoint,
  VolatilitySurfaceFunction,
} from './dupire-types';
import { blackScholesCallPrice } from './dupire-math';
import { evaluateLocalVolPoint } from './dupire-calibrator';

export class DupireLocalVolEngine {
  private readonly params: DupireMarketParams;

  constructor(params: DupireMarketParams) {
    this.params = params;
  }

  public calibrateFromVolSurface(
    volSurface: VolatilitySurfaceFunction,
    strikes: readonly number[],
    expiries: readonly number[]
  ): DupireSurfaceResult {
    const callPricer = (k: number, t: number): number => {
      const vol = volSurface(k, t);
      return blackScholesCallPrice(
        this.params.spot,
        k,
        t,
        this.params.riskFreeRate,
        this.params.dividendYield,
        vol
      );
    };

    const points: LocalVolPoint[] = [];
    const allViolations: ArbitrageViolation[] = [];

    for (const expiry of expiries) {
      for (const strike of strikes) {
        const { point, violations } = evaluateLocalVolPoint(
          this.params,
          callPricer,
          strike,
          expiry
        );
        points.push(point);
        allViolations.push(...violations);
      }
    }

    const vols = points.map((p) => p.localVol);
    const minLocalVol = vols.length > 0 ? Math.min(...vols) : 0;
    const maxLocalVol = vols.length > 0 ? Math.max(...vols) : 0;
    const meanLocalVol =
      vols.length > 0 ? vols.reduce((sum, v) => sum + v, 0) / vols.length : 0;

    return {
      points,
      violations: allViolations,
      minLocalVol,
      maxLocalVol,
      meanLocalVol,
      isArbitrageFree: allViolations.length === 0,
    };
  }

  public calibrateFromCallPricer(
    callPricer: (k: number, t: number) => number,
    strikes: readonly number[],
    expiries: readonly number[]
  ): DupireSurfaceResult {
    const points: LocalVolPoint[] = [];
    const allViolations: ArbitrageViolation[] = [];

    for (const expiry of expiries) {
      for (const strike of strikes) {
        const { point, violations } = evaluateLocalVolPoint(
          this.params,
          callPricer,
          strike,
          expiry
        );
        points.push(point);
        allViolations.push(...violations);
      }
    }

    const vols = points.map((p) => p.localVol);
    const minLocalVol = vols.length > 0 ? Math.min(...vols) : 0;
    const maxLocalVol = vols.length > 0 ? Math.max(...vols) : 0;
    const meanLocalVol =
      vols.length > 0 ? vols.reduce((sum, v) => sum + v, 0) / vols.length : 0;

    return {
      points,
      violations: allViolations,
      minLocalVol,
      maxLocalVol,
      meanLocalVol,
      isArbitrageFree: allViolations.length === 0,
    };
  }
}
