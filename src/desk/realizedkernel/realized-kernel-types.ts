/**
 * Wave 205: Hansen & Lunde (2006) Realized Kernel Types.
 * Microstructure noise-robust integrated variance estimation.
 * Strictly < 180 LOC, zero :any.
 */

export type KernelType = 'PARZEN' | 'TUKEY_HANNING' | 'BARTLETT' | 'CUBIC';
export type KernelFunctionType = KernelType | 'MODIFIED_TUKEY_HANNING';

export interface HighFrequencyTick {
  timestampMs: number;
  price: number;
  volume: number;
}

export interface RealizedKernelConfig {
  kernelType: KernelType;
  autoBandwidth: boolean;
  manualBandwidthH?: number;
  subsamplingStep: number;
  jitterNoiseCorrection: boolean;
}

export interface RealizedKernelResult {
  realizedVarianceRaw: number;
  realizedKernelVariance: number;
  realizedKernelVolatilityAnnualized: number;
  noiseVarianceOmega2: number;
  noiseToSignalRatio: number;
  optimalBandwidthH: number;
  sampleSize: number;
  autocovariances: number[];
  kernelWeights: number[];
  noiseRobustnessGainPct: number;
}
