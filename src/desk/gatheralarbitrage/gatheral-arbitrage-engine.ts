/**
 * Wave 215: Gatheral (2010) No-Dynamic-Arbitrage Decay Kernel Engine.
 *
 * Audits market impact specifications against dynamic price manipulation
 * and evaluates round-trip execution profitability.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  GatheralArbitrageConfig,
  RoundTripStrategy,
  GatheralArbitrageResult,
} from './gatheral-arbitrage-types';
import { GatheralArbitrageMath } from './gatheral-arbitrage-math';

export class GatheralArbitrageEngine {
  private readonly config: GatheralArbitrageConfig;

  constructor(config: GatheralArbitrageConfig) {
    if (config.impactExponent <= 0 || config.impactExponent > 1.0) {
      throw new Error('Impact exponent alpha must be in (0, 1]');
    }
    if (config.impactMultiplier <= 0) {
      throw new Error('Impact multiplier c must be strictly positive');
    }
    if (config.decayParameter < 0) {
      throw new Error('Decay parameter must be non-negative');
    }
    this.config = config;
  }

  public evaluateRoundTrip(strategy: RoundTripStrategy): GatheralArbitrageResult {
    if (strategy.shares <= 0) {
      throw new Error('Round-trip shares must be strictly positive');
    }
    if (strategy.horizonDays <= 0) {
      throw new Error('Strategy horizon days must be strictly positive');
    }

    const sim = GatheralArbitrageMath.simulateRoundTripExecution(strategy, this.config);
    const halfLife = GatheralArbitrageMath.calculateHalfLifeDays(
      this.config.kernelType,
      this.config.decayParameter
    );
    const safeBound = GatheralArbitrageMath.getTheoreticalArbitrageBound(
      this.config.impactExponent,
      this.config.kernelType
    );

    let status: 'NO_ARBITRAGE_COMPLIANT' | 'DYNAMIC_ARBITRAGE_DETECTED' | 'CRITICAL_BOUNDARY' =
      'NO_ARBITRAGE_COMPLIANT';

    if (sim.isArbitragePresent) {
      status = 'DYNAMIC_ARBITRAGE_DETECTED';
    } else if (
      this.config.kernelType === 'POWER_LAW' &&
      Math.abs(this.config.decayParameter - safeBound) < 0.05
    ) {
      status = 'CRITICAL_BOUNDARY';
    }

    return {
      impactExponentAlpha: this.config.impactExponent,
      kernelType: this.config.kernelType,
      decayParameter: this.config.decayParameter,
      roundTripCostBps: sim.roundTripNetCostBps,
      isDynamicArbitragePresent: sim.isArbitragePresent,
      theoreticalArbitrageFreeBound: safeBound,
      status,
      diagnostics: {
        roundTripNetShortfallBps: sim.roundTripNetCostBps,
        peakPriceDistortionBps: sim.peakPriceDistortionBps,
        decayHalfLifeDays: Number(halfLife.toFixed(4)),
      },
    };
  }

  public auditKernelSafety(): {
    isSafe: boolean;
    theoreticalBound: number;
    recommendation: string;
  } {
    const bound = GatheralArbitrageMath.getTheoreticalArbitrageBound(
      this.config.impactExponent,
      this.config.kernelType
    );

    if (this.config.impactExponent === 1.0 || this.config.kernelType === 'PERMANENT') {
      return {
        isSafe: true,
        theoreticalBound: bound,
        recommendation: 'Model is unconditionally arbitrage-free.',
      };
    }

    if (this.config.kernelType === 'EXPONENTIAL') {
      return {
        isSafe: false,
        theoreticalBound: 0.0,
        recommendation:
          'Exponential decay with sub-linear impact admits price manipulation. Switch to power-law decay.',
      };
    }

    const isSafe = this.config.decayParameter <= bound;
    return {
      isSafe,
      theoreticalBound: bound,
      recommendation: isSafe
        ? 'Power-law exponent satisfies Gatheral (2010) no-arbitrage condition.'
        : `Decay exponent ${this.config.decayParameter} exceeds safe bound ${bound}. Susceptible to manipulation.`,
    };
  }

  public getConfig(): Readonly<GatheralArbitrageConfig> {
    return { ...this.config };
  }
}
