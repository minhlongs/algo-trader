import {
  CreditGradesParams,
  CreditGradesResult,
  CreditGradesPoint,
} from './credit-grades-types';
import { CreditGradesMath } from './credit-grades-math';

export class CreditGradesEngine {
  public static evaluate(params: CreditGradesParams): CreditGradesResult {
    this.validateParams(params);

    const {
      equityPrice,
      debtPerShare,
      equityVolatility,
      recoveryRate,
      recoveryVolatility,
      riskFreeRate,
      maturities,
    } = params;

    const assetVolatility = CreditGradesMath.calculateAssetVolatility(
      equityPrice,
      debtPerShare,
      equityVolatility,
      recoveryRate
    );

    const leverageRatio = (recoveryRate * debtPerShare) / equityPrice;

    const curve: CreditGradesPoint[] = maturities.map((maturity) => {
      const defaultProb = CreditGradesMath.calculateDefaultProbability(
        equityPrice,
        debtPerShare,
        recoveryRate,
        recoveryVolatility,
        assetVolatility,
        maturity
      );

      const survivalProb = Math.max(0, 1 - defaultProb);
      const hazardRate =
        maturity > 0 && survivalProb > 1e-12
          ? -Math.log(survivalProb) / maturity
          : 0;

      const spreadFraction = CreditGradesMath.calculateParCdsSpread(
        equityPrice,
        debtPerShare,
        recoveryRate,
        recoveryVolatility,
        assetVolatility,
        riskFreeRate,
        maturity
      );

      const parCdsSpreadBps = spreadFraction * 10000;
      const discountFactor = Math.exp(-riskFreeRate * maturity);

      return {
        maturity,
        survivalProbability: survivalProb,
        defaultProbability: defaultProb,
        hazardRate,
        parCdsSpreadBps,
        discountFactor,
      };
    });

    const fiveYearPoint = curve.find((p) => Math.abs(p.maturity - 5.0) < 1e-4);
    const fiveYearSpreadBps =
      fiveYearPoint !== undefined
        ? fiveYearPoint.parCdsSpreadBps
        : CreditGradesMath.calculateParCdsSpread(
            equityPrice,
            debtPerShare,
            recoveryRate,
            recoveryVolatility,
            assetVolatility,
            riskFreeRate,
            5.0
          ) * 10000;

    return {
      assetVolatility,
      leverageRatio,
      curve,
      fiveYearSpreadBps,
    };
  }

  private static validateParams(params: CreditGradesParams): void {
    if (params.equityPrice <= 0) {
      throw new Error(`Equity price must be positive, got ${params.equityPrice}`);
    }
    if (params.debtPerShare <= 0) {
      throw new Error(`Debt per share must be positive, got ${params.debtPerShare}`);
    }
    if (params.equityVolatility <= 0) {
      throw new Error(`Equity volatility must be positive, got ${params.equityVolatility}`);
    }
    if (params.recoveryRate <= 0 || params.recoveryRate >= 1) {
      throw new Error(`Recovery rate must be in (0, 1), got ${params.recoveryRate}`);
    }
    if (params.recoveryVolatility <= 0) {
      throw new Error(`Recovery volatility must be positive, got ${params.recoveryVolatility}`);
    }
    if (params.maturities.length === 0) {
      throw new Error('Maturities array cannot be empty');
    }
  }
}
