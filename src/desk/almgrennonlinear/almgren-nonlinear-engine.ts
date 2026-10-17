/**
 * Almgren (2003) Engine.
 */

import { AlmgrenNonLinearConfig, AlmgrenNonLinearAssessment } from './almgren-nonlinear-types';
import { computePowerLawVelocity, evaluateAlmgrenNonLinearExecution } from './almgren-nonlinear-math';

export class AlmgrenNonLinearEngine {
  constructor(private readonly config: AlmgrenNonLinearConfig) {}

  public getVelocityAt(timeSec: number): number {
    return computePowerLawVelocity(this.config, timeSec);
  }

  public evaluate(): AlmgrenNonLinearAssessment {
    return evaluateAlmgrenNonLinearExecution(this.config);
  }

  public getConfig(): AlmgrenNonLinearConfig {
    return { ...this.config };
  }
}
