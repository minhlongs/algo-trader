import {
  DavisLoParams,
  DavisLoResult,
  TrancheResult,
} from './davis-lo-types';
import { DavisLoMath } from './davis-lo-math';

export class DavisLoEngine {
  public static evaluate(params: DavisLoParams): DavisLoResult {
    this.validate(params);

    const {
      numObligors,
      baseHazardRate,
      contagionHazard,
      recoveryRate,
      timeHorizon,
      riskFreeRate,
      tranches,
      timeSteps = 200,
    } = params;

    const probs = DavisLoMath.solveDefaultDistribution(
      numObligors,
      baseHazardRate,
      contagionHazard,
      timeHorizon,
      timeSteps
    );

    let expectedDefaults = 0.0;
    for (let k = 0; k <= numObligors; k++) {
      expectedDefaults += k * probs[k];
    }

    const lgd = 1.0 - recoveryRate;
    const expectedPortfolioLossFraction = (expectedDefaults / numObligors) * lgd;
    const expectedPortfolioLoss = expectedPortfolioLossFraction;

    const trancheResults: TrancheResult[] = tranches.map((tranche) =>
      DavisLoMath.evaluateTranche(
        tranche,
        probs,
        numObligors,
        recoveryRate,
        timeHorizon,
        riskFreeRate
      )
    );

    return {
      numObligors,
      timeHorizon,
      expectedDefaults,
      defaultProbabilities: probs,
      expectedPortfolioLoss,
      expectedPortfolioLossFraction,
      tranches: trancheResults,
    };
  }

  private static validate(params: DavisLoParams): void {
    if (params.numObligors <= 0 || !Number.isInteger(params.numObligors)) {
      throw new Error(
        `Number of obligors must be a positive integer, got ${params.numObligors}`
      );
    }
    if (params.baseHazardRate < 0) {
      throw new Error(
        `Base hazard rate cannot be negative, got ${params.baseHazardRate}`
      );
    }
    if (params.contagionHazard < 0) {
      throw new Error(
        `Contagion hazard cannot be negative, got ${params.contagionHazard}`
      );
    }
    if (params.recoveryRate < 0 || params.recoveryRate >= 1.0) {
      throw new Error(
        `Recovery rate must be in [0, 1), got ${params.recoveryRate}`
      );
    }
    if (params.timeHorizon <= 0) {
      throw new Error(
        `Time horizon must be positive, got ${params.timeHorizon}`
      );
    }
    if (!params.tranches || params.tranches.length === 0) {
      throw new Error('At least one tranche must be provided');
    }
    for (const t of params.tranches) {
      if (t.attachment < 0 || t.detachment > 1.0 || t.attachment >= t.detachment) {
        throw new Error(
          `Invalid tranche attachments [${t.attachment}, ${t.detachment}] for ${t.name}`
        );
      }
    }
  }
}
