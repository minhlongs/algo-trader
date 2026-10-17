/**
 * Wave 216: Avellaneda & Lipkin (2003) Short Squeeze Engine.
 *
 * Assesses hard-to-borrow borrow fees, lender recall, and forced short squeezes.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  AvellanedaLipkinConfig,
  ShortSqueezeSimulationParams,
  AvellanedaLipkinResult,
} from './avellaneda-lipkin-types';
import { AvellanedaLipkinMath } from './avellaneda-lipkin-math';

export class AvellanedaLipkinEngine {
  private readonly config: AvellanedaLipkinConfig;

  constructor(config: AvellanedaLipkinConfig) {
    if (config.spotPrice <= 0) {
      throw new Error('Spot price must be strictly positive');
    }
    if (config.freeFloatShares <= 0) {
      throw new Error('Free float shares must be strictly positive');
    }
    if (config.averageDailyVolume <= 0) {
      throw new Error('Average daily volume must be strictly positive');
    }
    if (config.annualBorrowFeeRate < 0) {
      throw new Error('Annual borrow fee rate must be non-negative');
    }
    this.config = config;
  }

  public evaluateSqueezeRisk(params: ShortSqueezeSimulationParams): AvellanedaLipkinResult {
    const dtc = AvellanedaLipkinMath.calculateDaysToCover(
      this.config.shortInterestShares,
      this.config.averageDailyVolume
    );
    const siPct = AvellanedaLipkinMath.calculateShortInterestPct(
      this.config.shortInterestShares,
      this.config.freeFloatShares
    );

    const sim = AvellanedaLipkinMath.simulateSqueezeTrajectory(this.config, params);

    let regime: 'NOMINAL' | 'ELEVATED_BORROW' | 'ACUTE_SHORT_SQUEEZE' = 'NOMINAL';
    if (sim.isSqueezeTriggered || this.config.annualBorrowFeeRate >= 0.25 || dtc >= 7.0) {
      regime = 'ACUTE_SHORT_SQUEEZE';
    } else if (this.config.annualBorrowFeeRate >= 0.10 || dtc >= 3.0 || siPct >= 15.0) {
      regime = 'ELEVATED_BORROW';
    }

    return {
      spotPrice: this.config.spotPrice,
      daysToCover: Number(dtc.toFixed(2)),
      shortInterestPct: Number(siPct.toFixed(2)),
      annualBorrowFeePct: Number((this.config.annualBorrowFeeRate * 100.0).toFixed(2)),
      isSqueezeTriggered: sim.isSqueezeTriggered,
      squeezeRegime: regime,
      terminalPrice: sim.terminalPrice,
      maxForcedBuyInSpeedSharesPerDay: sim.maxBuyInSpeed,
      trajectory: sim.trajectory,
    };
  }

  public getConfig(): Readonly<AvellanedaLipkinConfig> {
    return { ...this.config };
  }
}
