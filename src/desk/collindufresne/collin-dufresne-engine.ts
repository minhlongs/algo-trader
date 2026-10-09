import { CollinDufresneParams, CollinDufresneResult, CreditCurvePoint } from './collin-dufresne-types';
import { CollinDufresneMath } from './collin-dufresne-math';

export class CollinDufresneEngine {
  public static calculate(params: CollinDufresneParams): CollinDufresneResult {
    const {
      currentLeverage: y0,
      targetLeverage: yBar,
      reversionSpeed: lambda,
      assetVolatility: assetVol,
      recoveryRate,
      timeHorizon: T,
    } = params;

    if (lambda <= 0.0 || assetVol <= 0.0 || T <= 0.0) {
      throw new Error('reversionSpeed, assetVolatility, and timeHorizon must be strictly positive');
    }
    if (recoveryRate < 0.0 || recoveryRate >= 1.0) {
      throw new Error('recoveryRate must be in [0, 1)');
    }

    const statVar = CollinDufresneMath.stationaryVariance(assetVol, lambda);
    const expTermLeverage = CollinDufresneMath.conditionalMean(y0, yBar, lambda, T);
    const terminalPD = CollinDufresneMath.calculateDefaultProbability(y0, yBar, lambda, assetVol, T);
    const terminalSpread = CollinDufresneMath.calculateSpreadBps(terminalPD, recoveryRate, T);

    // Generate credit spread term structure from 0.25y to T
    const maturities = [0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0].filter((m) => m <= T || m === 0.25);
    if (!maturities.includes(T)) maturities.push(T);
    maturities.sort((a, b) => a - b);

    const termStructure: CreditCurvePoint[] = maturities.map((m) => {
      const pd = CollinDufresneMath.calculateDefaultProbability(y0, yBar, lambda, assetVol, m);
      const spreadBps = CollinDufresneMath.calculateSpreadBps(pd, recoveryRate, m);
      return {
        maturity: m,
        survivalProb: 1.0 - pd,
        cumulativeDefaultProb: pd,
        creditSpreadBps: spreadBps,
      };
    });

    return {
      stationaryVariance: statVar,
      expectedTerminalLeverage: expTermLeverage,
      defaultProbability: terminalPD,
      creditSpreadBps: terminalSpread,
      termStructure,
    };
  }
}
