import { PrepaymentRatePoint } from './mbs-types';

export class PsaPrepaymentModel {
  public computePrepaymentRate(month: number, psaSpeedPct: number): PrepaymentRatePoint {
    const psaMultiplier = psaSpeedPct / 100.0;
    let baseCprPct = 0;

    if (month <= 0) {
      baseCprPct = 0;
    } else if (month <= 30) {
      baseCprPct = 6.0 * (month / 30.0);
    } else {
      baseCprPct = 6.0;
    }

    const cprPct = baseCprPct * psaMultiplier;
    const cprDecimal = cprPct / 100.0;
    const smmDecimal = 1.0 - Math.pow(1.0 - Math.min(0.9999, cprDecimal), 1.0 / 12.0);
    const smmPct = smmDecimal * 100.0;

    return {
      month,
      cprAnnualizedPct: Number(cprPct.toFixed(4)),
      smmMonthlyPct: Number(smmPct.toFixed(4)),
    };
  }
}
