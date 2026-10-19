/**
 * Wave 237: Almgren & Lorenz (2007) Engine
 */

import { BayesianDriftConfig, PriceObservationUpdate, BayesianStateAssessment } from './lorenz-types';
import { updateBayesianDrift } from './lorenz-math';

export class AlmgrenLorenzEngine {
  private currentMean: number;
  private currentVar: number;

  constructor(private readonly config: BayesianDriftConfig) {
    this.currentMean = config.initialPriorMeanAlpha0;
    this.currentVar = config.priorVarianceSigma0Sq;
  }

  public update(
    obs: PriceObservationUpdate,
    remainingSharesX: number,
    remainingTimeT: number
  ): BayesianStateAssessment {
    const assessment = updateBayesianDrift(
      this.currentMean,
      this.currentVar,
      obs,
      this.config,
      remainingSharesX,
      remainingTimeT
    );
    this.currentMean = assessment.posteriorMeanAlpha;
    this.currentVar = assessment.posteriorVarianceSigmaSq;
    return assessment;
  }
}
