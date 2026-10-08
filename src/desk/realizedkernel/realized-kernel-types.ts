export type KernelFunctionType = 'PARZEN' | 'MODIFIED_TUKEY_HANNING';

export interface RealizedKernelOptions {
  readonly kernelType?: KernelFunctionType;
  readonly maxLags?: number;
  readonly subsampleStep?: number;
}

export interface RealizedKernelResult {
  readonly realizedKernelVariance: number; // RK
  readonly annualizedVolatilityPct: number; // sqrt(252 * RK) * 100
  readonly optimalBandwidthH: number;      // H*
  readonly standardRealizedVariance: number; // gamma_0
  readonly noiseVarianceEstimate: number;    // omega^2
  readonly sampleCount: number;
}
