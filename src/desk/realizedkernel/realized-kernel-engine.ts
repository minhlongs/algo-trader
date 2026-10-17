/**
 * Wave 205: Hansen & Lunde (2006) Realized Kernel Engine.
 * Implements non-negative noise-corrected realized kernel estimators.
 * Strictly < 180 LOC, zero :any.
 */

import {
  RealizedKernelConfig,
  RealizedKernelResult,
  HighFrequencyTick,
} from './realized-kernel-types';
import { RealizedKernelMath } from './realized-kernel-math';

export class RealizedKernelEngine {
  private readonly config: RealizedKernelConfig;

  constructor(config?: Partial<RealizedKernelConfig>) {
    this.config = {
      kernelType: config?.kernelType ?? 'PARZEN',
      autoBandwidth: config?.autoBandwidth ?? true,
      manualBandwidthH: config?.manualBandwidthH,
      subsamplingStep: config?.subsamplingStep ?? 1,
      jitterNoiseCorrection: config?.jitterNoiseCorrection ?? true,
    };
  }

  /**
   * Calculate Realized Kernel from high-frequency tick price stream.
   */
  public estimateFromTicks(ticks: HighFrequencyTick[]): RealizedKernelResult {
    if (ticks.length < 2) {
      return this.emptyResult();
    }

    const prices = ticks.map((t) => t.price);
    return this.estimateFromPrices(prices);
  }

  /**
   * Calculate Realized Kernel from array of raw price levels.
   */
  public estimateFromPrices(prices: number[]): RealizedKernelResult {
    const nPrices = prices.length;
    if (nPrices < 2) return this.emptyResult();

    const returns: number[] = [];
    for (let i = 1; i < nPrices; i += this.config.subsamplingStep) {
      const pPrev = prices[i - 1];
      const pCurr = prices[i];
      if (pPrev > 0 && pCurr > 0) {
        returns.push(Math.log(pCurr / pPrev));
      }
    }

    return this.estimateFromReturns(returns);
  }

  /**
   * Calculate Realized Kernel variance from high-frequency log returns.
   */
  public estimateFromReturns(returns: number[]): RealizedKernelResult {
    const n = returns.length;
    if (n === 0) return this.emptyResult();

    const gamma0 = RealizedKernelMath.calculateAutocovariance(returns, 0);
    const omega2 = RealizedKernelMath.estimateNoiseVariance(returns);
    const noiseToSignal = gamma0 > 0 ? omega2 / gamma0 : 0.0;

    let h = 1;
    if (!this.config.autoBandwidth && this.config.manualBandwidthH !== undefined) {
      h = Math.max(1, this.config.manualBandwidthH);
    } else {
      h = RealizedKernelMath.calculateOptimalBandwidth(
        n,
        omega2,
        gamma0,
        this.config.kernelType
      );
    }

    let rkSum = gamma0;
    const autocovs: number[] = [gamma0];
    const weights: number[] = [1.0];

    for (let lag = 1; lag <= h; lag++) {
      const gammaLag = RealizedKernelMath.calculateAutocovariance(returns, lag);
      const w = RealizedKernelMath.evaluateKernelWeight(
        (lag - 1) / h,
        this.config.kernelType
      );
      rkSum += 2.0 * w * gammaLag;
      autocovs.push(gammaLag);
      weights.push(w);
    }

    // Guard against negative variance in severe finite samples
    const rkVariance = Math.max(1e-12, rkSum);
    // Annualize (assuming 252 trading days * 6.5 trading hours)
    const annualizedVol = Math.sqrt(rkVariance * 252.0);
    const gainPct =
      gamma0 > 0 ? ((gamma0 - rkVariance) / gamma0) * 100.0 : 0.0;

    return {
      realizedVarianceRaw: gamma0,
      realizedKernelVariance: rkVariance,
      realizedKernelVolatilityAnnualized: annualizedVol,
      noiseVarianceOmega2: omega2,
      noiseToSignalRatio: noiseToSignal,
      optimalBandwidthH: h,
      sampleSize: n,
      autocovariances: autocovs,
      kernelWeights: weights,
      noiseRobustnessGainPct: gainPct,
    };
  }

  public estimateVolatility(
    prices: number[],
    _opts?: { kernelType?: 'PARZEN' | 'MODIFIED_TUKEY_HANNING' }
  ): {
    sampleCount: number;
    realizedKernelVariance: number;
    annualizedVolatilityPct: number;
    optimalBandwidthH: number;
    standardRealizedVariance: number;
    noiseVarianceEstimate: number;
  } {
    if (prices.length < 10) {
      throw new Error('At least 10 price observations required for Realized Kernel');
    }
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(prices[i] - prices[i - 1]);
    }
    const res = this.estimateFromReturns(returns);
    return {
      sampleCount: prices.length,
      realizedKernelVariance: res.realizedKernelVariance,
      annualizedVolatilityPct: res.realizedKernelVolatilityAnnualized * 100,
      optimalBandwidthH: res.optimalBandwidthH,
      standardRealizedVariance: res.realizedVarianceRaw,
      noiseVarianceEstimate: res.noiseVarianceOmega2,
    };
  }

  private emptyResult(): RealizedKernelResult {
    return {
      realizedVarianceRaw: 0.0,
      realizedKernelVariance: 0.0,
      realizedKernelVolatilityAnnualized: 0.0,
      noiseVarianceOmega2: 0.0,
      noiseToSignalRatio: 0.0,
      optimalBandwidthH: 0,
      sampleSize: 0,
      autocovariances: [],
      kernelWeights: [],
      noiseRobustnessGainPct: 0.0,
    };
  }
}
