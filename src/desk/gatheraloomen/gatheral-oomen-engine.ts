/**
 * Wave 220: Gatheral & Oomen (2010) Zero-Intelligence Order Book Engine.
 *
 * Exposes high-level API for order book equilibrium and signature modeling.
 * Strictly < 100 LOC, zero mocks, zero :any.
 */

import type {
  GatheralOomenConfig,
  ZeroIntelligenceMetrics,
  VolatilitySignaturePoint,
} from './gatheral-oomen-types';
import { GatheralOomenMath } from './gatheral-oomen-math';

export class GatheralOomenEngine {
  constructor(private readonly config: GatheralOomenConfig) {}

  public getEquilibriumMetrics(): ZeroIntelligenceMetrics {
    return GatheralOomenMath.calculateEquilibriumMetrics(this.config);
  }

  public getVolatilitySignature(lags: number[] = [0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0]): VolatilitySignaturePoint[] {
    return GatheralOomenMath.generateVolatilitySignature(this.config, lags);
  }

  public getOptimalSamplingFrequencySec(): number {
    const kappa = this.config.meanReversionKappa ?? 0.5;
    // Optimal sampling interval balances noise variance vs signal discretization
    return Number((2.0 / Math.max(0.1, kappa)).toFixed(2));
  }
}
