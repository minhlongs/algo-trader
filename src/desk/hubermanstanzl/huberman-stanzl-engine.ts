import {
  HubermanStanzlParams,
  HubermanStanzlResult,
} from './huberman-stanzl-types';
import { HubermanStanzlMath } from './huberman-stanzl-math';

export class HubermanStanzlEngine {
  public static evaluate(params: HubermanStanzlParams): HubermanStanzlResult {
    this.validate(params);

    const {
      permanentImpactGamma,
      temporaryImpactTheta,
      initialPrice,
      liquidationQuantity,
      periods,
      crossAssetMatrix,
      testRoundTripSchedule,
    } = params;

    const noManipulationConditionSatisfied =
      permanentImpactGamma >= 0 && temporaryImpactTheta >= 0;

    const optimalLiquidation = HubermanStanzlMath.computeOptimalLiquidation(
      liquidationQuantity,
      initialPrice,
      periods,
      permanentImpactGamma,
      temporaryImpactTheta
    );

    let roundTripTest;
    if (testRoundTripSchedule && testRoundTripSchedule.length > 0) {
      roundTripTest = HubermanStanzlMath.calculateRoundTripCost(
        testRoundTripSchedule,
        initialPrice,
        permanentImpactGamma,
        temporaryImpactTheta
      );
    }

    let crossImpactTest;
    if (crossAssetMatrix && crossAssetMatrix.length > 0) {
      crossImpactTest = HubermanStanzlMath.analyzeCrossImpactMatrix(crossAssetMatrix);
    }

    return {
      permanentImpactGamma,
      temporaryImpactTheta,
      noManipulationConditionSatisfied,
      optimalLiquidation,
      roundTripTest,
      crossImpactTest,
    };
  }

  private static validate(params: HubermanStanzlParams): void {
    if (params.initialPrice <= 0) {
      throw new Error(`Initial price must be positive, got ${params.initialPrice}`);
    }
    if (params.periods < 1 || !Number.isInteger(params.periods)) {
      throw new Error(`Periods must be an integer >= 1, got ${params.periods}`);
    }
    if (params.permanentImpactGamma < 0) {
      throw new Error(
        `Permanent impact gamma cannot be negative, got ${params.permanentImpactGamma}`
      );
    }
    if (params.temporaryImpactTheta < 0) {
      throw new Error(
        `Temporary impact theta cannot be negative, got ${params.temporaryImpactTheta}`
      );
    }
    if (params.liquidationQuantity < 0) {
      throw new Error(
        `Liquidation quantity cannot be negative, got ${params.liquidationQuantity}`
      );
    }
    if (params.crossAssetMatrix) {
      const rows = params.crossAssetMatrix.length;
      for (const row of params.crossAssetMatrix) {
        if (row.length !== rows) {
          throw new Error('Cross-impact matrix must be square');
        }
      }
    }
  }
}
