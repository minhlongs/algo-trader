/**
 * Wave 250: Gatheral, Jaisson & Rosenbaum (2018) Rough Fractional Volatility Types.
 *
 * Models sub-diffusive rough fractional volatility dynamics with Hurst parameter H in (0, 0.5)
 * approximating the fractional Riemann-Liouville kernel via a sum of exponentials.
 *
 * Strictly < 80 LOC, zero `:any` types.
 */

export interface RoughVolKernelComponent {
  readonly weightOmega: number;
  readonly meanReversionTheta: number;
}

export interface GatheralRoughVolConfig {
  readonly hurstParameterH: number; // typically ~0.10 for rough volatility
  readonly baseVolatilityXi0: number; // instantaneous variance baseline
  readonly volOfVolNu: number; // volatility of volatility
  readonly kernelComponents: readonly RoughVolKernelComponent[];
}

export interface RoughVolState {
  readonly timeHorizonT: number;
  readonly instantaneousVariance: number;
  readonly roughKernelValue: number;
  readonly fractionalDecayMetric: number;
  readonly isSubdiffusive: boolean;
}
