import { KernelWeights } from './kernel-weights';
import { RealizedKernelOptions, RealizedKernelResult } from './realized-kernel-types';

export class RealizedKernelEngine {
  public estimateVolatility(
    logPrices: number[],
    options: RealizedKernelOptions = {}
  ): RealizedKernelResult {
    const n = logPrices.length;
    if (n < 10) throw new Error('At least 10 price observations required for Realized Kernel');

    const kernelType = options.kernelType ?? 'PARZEN';
    const numReturns = n - 1;
    const returns = new Float64Array(numReturns);

    let gamma0 = 0.0;
    for (let i = 0; i < numReturns; i++) {
      const ret = logPrices[i + 1]! - logPrices[i]!;
      returns[i] = ret;
      gamma0 += ret * ret;
    }

    // Noise variance estimate omega^2 = gamma_0 / (2n)
    const omegaSq = gamma0 / (2.0 * numReturns);

    // Pilot integrated variance via subsampling
    const step = Math.max(2, options.subsampleStep ?? 5);
    let subsampledRV = 0.0;
    let subsampleCount = 0;
    for (let i = 0; i < numReturns - step; i += step) {
      let cumRet = 0.0;
      for (let s = 0; s < step; s++) {
        cumRet += returns[i + s]!;
      }
      subsampledRV += cumRet * cumRet;
      subsampleCount++;
    }
    const pilotIV = subsampleCount > 0 ? subsampledRV : gamma0;

    // Bandwidth rule of thumb: H* ~ c * (omega^2 / sqrt(IV))^(4/5) * n^(3/5)
    const ratio = Math.max(1e-6, omegaSq / Math.sqrt(Math.max(1e-8, pilotIV)));
    const cConstant = kernelType === 'PARZEN' ? 3.5134 : 2.15;
    const rawH = cConstant * Math.pow(ratio, 0.8) * Math.pow(numReturns, 0.6);
    const maxLags = options.maxLags ?? Math.floor(numReturns / 3);
    const optimalH = Math.max(1, Math.min(maxLags, Math.round(rawH)));

    // Compute autocovariances and sum weighted terms
    let rk = gamma0;
    for (let h = 1; h <= optimalH; h++) {
      let gammaH = 0.0;
      for (let j = 0; j < numReturns - h; j++) {
        gammaH += returns[j]! * returns[j + h]!;
      }
      const weight = KernelWeights.weight(kernelType, h / (optimalH + 1.0));
      rk += 2.0 * weight * gammaH;
    }

    const positiveRK = Math.max(1e-8, rk);
    const annualizedVol = Math.sqrt(252.0 * positiveRK) * 100.0;

    return {
      realizedKernelVariance: Number(positiveRK.toFixed(8)),
      annualizedVolatilityPct: Number(annualizedVol.toFixed(4)),
      optimalBandwidthH: optimalH,
      standardRealizedVariance: Number(gamma0.toFixed(8)),
      noiseVarianceEstimate: Number(omegaSq.toFixed(8)),
      sampleCount: n,
    };
  }
}
