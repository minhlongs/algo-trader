/**
 * Wave 223: Guéant (2015) Accelerated Share Repurchase (ASR) Engine.
 *
 * Strictly < 50 LOC, zero :any.
 */

import type { GueantAsrConfig, AsrTrajectoryPoint } from './gueant-asr-types';
import { GueantAsrMath } from './gueant-asr-math';

export class GueantAsrEngine {
  constructor(private readonly config: GueantAsrConfig) {}

  public getCharacteristicRateKappa(): number {
    return Number(GueantAsrMath.computeKappa(this.config).toFixed(6));
  }

  public getOptimalVelocity(timeSec: number): number {
    return Number(GueantAsrMath.computeOptimalVelocity(this.config, timeSec).toFixed(4));
  }

  public generateTrajectory(evaluationTimesSec: number[]): AsrTrajectoryPoint[] {
    return GueantAsrMath.computeTrajectory(this.config, evaluationTimesSec);
  }
}
