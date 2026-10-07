/**
 * Regime Jump Diffusion Filter
 * Estimates volatility jumps and regime transitions across market shocks.
 *
 * @module desk/rl/regime-jump-diffusion-filter
 */

import { RegimeFilterState, VolatilityRegime } from './continuous-rl-vol-types';

export class RegimeJumpDiffusionFilter {
  private smoothedVol = 0.20;
  private currentRegime: VolatilityRegime = 'LOW_VOL_CALM';
  private readonly jumpThreshold: number;
  private readonly smoothingFactor: number;

  public constructor(jumpThreshold = 0.05, smoothingFactor = 0.15) {
    this.jumpThreshold = jumpThreshold;
    this.smoothingFactor = smoothingFactor;
  }

  public updateObservation(returnMagnitude: number, currentVolEstimate: number): RegimeFilterState {
    const volInnovation = Math.abs(currentVolEstimate - this.smoothedVol);
    this.smoothedVol = (1 - this.smoothingFactor) * this.smoothedVol + this.smoothingFactor * currentVolEstimate;

    const isJump = returnMagnitude > this.jumpThreshold * 3 || volInnovation > this.jumpThreshold * 2;
    const jumpProbability = Math.min(1.0, (volInnovation / this.jumpThreshold) * 0.5 + (isJump ? 0.5 : 0));

    if (isJump) {
      this.currentRegime = 'JUMP_DISCONTINUOUS';
    } else if (this.smoothedVol > 0.60) {
      this.currentRegime = 'HIGH_VOL_STRESSED';
    } else if (this.smoothedVol > 0.30) {
      this.currentRegime = 'MEDIUM_VOL_NORMAL';
    } else {
      this.currentRegime = 'LOW_VOL_CALM';
    }

    return {
      currentRegime: this.currentRegime,
      jumpProbability: Number(jumpProbability.toFixed(3)),
      transitionIntensity: Number((volInnovation * 10).toFixed(3)),
      smoothedVol: Number(this.smoothedVol.toFixed(4)),
    };
  }

  public getState(): { regime: VolatilityRegime; smoothedVol: number } {
    return {
      regime: this.currentRegime,
      smoothedVol: this.smoothedVol,
    };
  }
}
