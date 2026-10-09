import {
  SchonbucherParams,
  SchonbucherResult,
  TrancheEvaluation,
} from './schonbucher-types';
import { SchonbucherMath } from './schonbucher-math';

export class SchonbucherEngine {
  public static evaluate(params: SchonbucherParams): SchonbucherResult {
    this.validate(params);

    const { obligors, timeHorizon, riskFreeRate, tranches, quadraturePoints = 64 } = params;

    const totalPortfolioNotional = obligors.reduce((acc, ob) => acc + ob.notional, 0);

    const trancheEvaluations: TrancheEvaluation[] = tranches.map((tranche) => {
      const evalRes = SchonbucherMath.evaluateTranche(
        tranche,
        obligors,
        timeHorizon,
        riskFreeRate,
        totalPortfolioNotional,
        quadraturePoints
      );

      return {
        name: tranche.name,
        attachment: tranche.attachment,
        detachment: tranche.detachment,
        width: tranche.detachment - tranche.attachment,
        expectedLossFraction: evalRes.expectedLossFraction,
        expectedLossAmount: evalRes.expectedLossAmount,
        protectionValue: evalRes.protectionValue,
        trancheSpreadBps: evalRes.trancheSpreadBps,
      };
    });

    // Unconstrained portfolio expected loss (attachment 0, detachment 1)
    const portFull = SchonbucherMath.evaluateTranche(
      { name: 'Full Portfolio', attachment: 0.0, detachment: 1.0 },
      obligors,
      timeHorizon,
      riskFreeRate,
      totalPortfolioNotional,
      quadraturePoints
    );

    return {
      timeHorizon,
      totalPortfolioNotional,
      expectedPortfolioLoss: portFull.expectedLossAmount,
      expectedPortfolioLossFraction: portFull.expectedLossFraction,
      tranches: trancheEvaluations,
    };
  }

  private static validate(params: SchonbucherParams): void {
    if (!params.obligors || params.obligors.length === 0) {
      throw new Error('Obligors list cannot be empty');
    }
    if (params.timeHorizon <= 0) {
      throw new Error(`Time horizon must be positive, got ${params.timeHorizon}`);
    }
    for (const ob of params.obligors) {
      if (ob.baseHazardRate < 0) {
        throw new Error(`Base hazard rate cannot be negative, got ${ob.baseHazardRate}`);
      }
      if (ob.factorLoading < 0 || ob.factorLoading >= 1.0) {
        throw new Error(`Factor loading must be in [0, 1), got ${ob.factorLoading}`);
      }
      if (ob.recoveryRate < 0 || ob.recoveryRate >= 1.0) {
        throw new Error(`Recovery rate must be in [0, 1), got ${ob.recoveryRate}`);
      }
      if (ob.notional <= 0) {
        throw new Error(`Obligor notional must be positive, got ${ob.notional}`);
      }
    }
    if (!params.tranches || params.tranches.length === 0) {
      throw new Error('Tranches list cannot be empty');
    }
    for (const tr of params.tranches) {
      if (tr.attachment < 0 || tr.detachment > 1.0 || tr.attachment >= tr.detachment) {
        throw new Error(`Invalid tranche attachments [${tr.attachment}, ${tr.detachment}]`);
      }
    }
  }
}
