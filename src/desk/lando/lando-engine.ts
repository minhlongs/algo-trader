import {
  CreditRating,
  LandoParams,
  LandoResult,
  RatingTenorMetric,
  TransitionProbabilityMatrix,
} from './lando-types';
import { LandoMath } from './lando-math';

export class LandoEngine {
  public static evaluate(params: LandoParams): LandoResult {
    this.validate(params);

    const { generatorMatrix, tenors, recoveryRate, initialRating } = params;
    const ratingIdx = LandoMath.getRatingIndex(initialRating);
    const sortedTenors = [...tenors].sort((a, b) => a - b);

    const transitionMatrices: TransitionProbabilityMatrix[] = [];
    const curve: RatingTenorMetric[] = [];

    for (const t of sortedTenors) {
      const pMatrix = LandoMath.matrixExponential(generatorMatrix, t);
      transitionMatrices.push({ tenor: t, matrix: pMatrix });

      const row = pMatrix[ratingIdx];
      const defaultProb = row[7]; // State 7 is 'D' (Default)
      const survivalProb = Math.max(0.0, 1.0 - defaultProb);
      const creditSpreadBps = LandoMath.calculateCreditSpreadBps(defaultProb, recoveryRate, t);

      let downgradeProb = 0.0;
      for (let j = ratingIdx + 1; j < 7; j++) downgradeProb += row[j];

      let upgradeProb = 0.0;
      for (let j = 0; j < ratingIdx; j++) upgradeProb += row[j];

      curve.push({
        tenor: t,
        survivalProbability: survivalProb,
        defaultProbability: defaultProb,
        creditSpreadBps,
        downgradeProbability: downgradeProb,
        upgradeProbability: upgradeProb,
      });
    }

    // Benchmark 5Y credit spread
    const p5Y = LandoMath.matrixExponential(generatorMatrix, 5.0);
    const def5Y = p5Y[ratingIdx][7];
    const benchmark5YSpreadBps = LandoMath.calculateCreditSpreadBps(def5Y, recoveryRate, 5.0);

    return {
      initialRating,
      ratingIndex: ratingIdx,
      recoveryRate,
      transitionMatrices,
      curve,
      benchmark5YSpreadBps,
    };
  }

  private static validate(params: LandoParams): void {
    const { generatorMatrix, tenors, recoveryRate } = params;

    if (!generatorMatrix || generatorMatrix.length !== 8) {
      throw new Error(`Generator matrix Q must be 8x8, got length ${generatorMatrix?.length}`);
    }

    for (let i = 0; i < 8; i++) {
      if (!generatorMatrix[i] || generatorMatrix[i].length !== 8) {
        throw new Error(`Generator matrix row ${i} must have length 8`);
      }
      let rowSum = 0.0;
      for (let j = 0; j < 8; j++) {
        const val = generatorMatrix[i][j];
        if (i !== j && val < -1e-9) {
          throw new Error(`Off-diagonal generator rate Q[${i}][${j}] must be non-negative: ${val}`);
        }
        rowSum += val;
      }
      if (Math.abs(rowSum) > 1e-4) {
        throw new Error(`Generator row ${i} must sum to 0, got sum ${rowSum}`);
      }
    }

    if (!tenors || tenors.length === 0) {
      throw new Error('At least one tenor must be provided');
    }
    for (const t of tenors) {
      if (t <= 0) throw new Error(`Tenor must be positive, got ${t}`);
    }

    if (recoveryRate < 0 || recoveryRate >= 1.0) {
      throw new Error(`Recovery rate must be between 0 and 1, got ${recoveryRate}`);
    }
  }
}
