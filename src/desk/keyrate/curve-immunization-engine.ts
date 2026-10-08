import { BondCashFlow, ImmunizationHedgeResult } from './keyrate-types';
import { KeyRateDurationEngine } from './keyrate-duration-engine';

export class CurveImmunizationEngine {
  private readonly krdEngine = new KeyRateDurationEngine();

  public calculateImmunizationHedge(
    cashFlows: BondCashFlow[],
    yieldPct: number
  ): ImmunizationHedgeResult {
    const krdResults = this.krdEngine.computeKrd(cashFlows, yieldPct);
    const pv0 = cashFlows.reduce(
      (acc, cf) => acc + cf.cashFlowUsd / Math.pow(1.0 + yieldPct / 100.0, cf.timeYears),
      0
    );

    // To immunize key rate duration DV01 at each key rate, hedge instrument notional:
    // DV01_hedge_i = -DV01_portfolio_i
    // Assuming zero-coupon bonds at key rate tenors (D = Tenor, DV01_per_$100 = Tenor * 0.0001)
    const hedgeWeights = krdResults.map(krd => {
      const dv01PerUsd = (krd.tenorYears * 0.0001);
      const hedgeNotionalUsd = dv01PerUsd > 0 ? -(krd.dv01Usd / dv01PerUsd) : 0;
      return {
        tenorYears: krd.tenorYears,
        notionalUsd: Number(hedgeNotionalUsd.toFixed(2)),
      };
    });

    const netDv01Residual = krdResults.reduce((acc, krd, idx) => {
      const hedgeNotional = hedgeWeights[idx]!.notionalUsd;
      const hedgeDv01 = hedgeNotional * krd.tenorYears * 0.0001;
      return acc + (krd.dv01Usd + hedgeDv01);
    }, 0);

    return {
      portfolioPresentValueUsd: Number(pv0.toFixed(2)),
      portfolioKrd: krdResults,
      hedgeWeights,
      netDv01ResidualUsd: Number(netDv01Residual.toFixed(4)),
    };
  }
}
