/**
 * Wave 225: Donier et al. (2015) Dynamical Theory of Market Impact Engine.
 *
 * Strictly < 50 LOC, zero :any.
 */

import type { DonierImpactConfig, ImpactRegimeAssessment } from './donier-impact-types';
import { DonierImpactMath } from './donier-impact-math';

export class DonierImpactEngine {
  constructor(private readonly config: DonierImpactConfig) {}

  public getCriticalVelocity(): number {
    return Number(DonierImpactMath.computeCriticalVelocity(this.config).toFixed(2));
  }

  public getSquareRootImpact(metaorderShares: number): number {
    return Number(DonierImpactMath.computeSquareRootImpact(this.config, metaorderShares).toFixed(6));
  }

  public evaluateExecution(
    metaorderShares: number,
    executionDurationSec: number
  ): ImpactRegimeAssessment {
    return DonierImpactMath.evaluateRegime(this.config, metaorderShares, executionDurationSec);
  }
}
