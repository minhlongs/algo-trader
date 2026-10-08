import { MbsPoolTerms, MbsMonthlyCashflow, MbsCashflowSummary } from './mbs-types';
import { PsaPrepaymentModel } from './psa-prepayment-model';

export class MbsCashflowEngine {
  private readonly psaModel = new PsaPrepaymentModel();

  public generateCashflows(terms: MbsPoolTerms): { schedule: MbsMonthlyCashflow[]; summary: MbsCashflowSummary } {
    const { originalBalanceUsd, grossCouponPct, servicingFeeBps, originalMaturityMonths, psaSpeedPct } = terms;
    const netCouponPct = grossCouponPct - servicingFeeBps / 100.0;
    const monthlyRate = (netCouponPct / 100.0) / 12.0;

    let balance = originalBalanceUsd;
    const schedule: MbsMonthlyCashflow[] = [];

    let totalPrincipal = 0;
    let totalInterest = 0;
    let weightedPrincipalTimeMonths = 0;

    for (let m = 1; m <= originalMaturityMonths && balance > 0.01; m++) {
      const remainingMonths = originalMaturityMonths - m + 1;
      const scheduledPayment = monthlyRate > 0
        ? (balance * monthlyRate) / (1.0 - Math.pow(1.0 + monthlyRate, -remainingMonths))
        : balance / remainingMonths;

      const scheduledInterest = balance * monthlyRate;
      const scheduledPrincipal = Math.min(balance, Math.max(0, scheduledPayment - scheduledInterest));

      const balanceAfterScheduled = Math.max(0, balance - scheduledPrincipal);
      const { smmMonthlyPct } = this.psaModel.computePrepaymentRate(m, psaSpeedPct);
      const prepayments = Math.min(balanceAfterScheduled, balanceAfterScheduled * (smmMonthlyPct / 100.0));

      const totalPrincipalMonth = scheduledPrincipal + prepayments;
      const endingBalance = Math.max(0, balance - totalPrincipalMonth);
      const totalCashflow = scheduledInterest + totalPrincipalMonth;

      schedule.push({
        month: m,
        beginningBalanceUsd: Number(balance.toFixed(2)),
        scheduledInterestUsd: Number(scheduledInterest.toFixed(2)),
        scheduledPrincipalUsd: Number(scheduledPrincipal.toFixed(2)),
        prepaymentsUsd: Number(prepayments.toFixed(2)),
        totalCashflowUsd: Number(totalCashflow.toFixed(2)),
        endingBalanceUsd: Number(endingBalance.toFixed(2)),
      });

      totalPrincipal += totalPrincipalMonth;
      totalInterest += scheduledInterest;
      weightedPrincipalTimeMonths += totalPrincipalMonth * m;
      balance = endingBalance;
    }

    const walYears = totalPrincipal > 0
      ? (weightedPrincipalTimeMonths / totalPrincipal) / 12.0
      : 0;

    return {
      schedule,
      summary: {
        totalPrincipalReceivedUsd: Number(totalPrincipal.toFixed(2)),
        totalInterestReceivedUsd: Number(totalInterest.toFixed(2)),
        weightedAverageLifeYears: Number(walYears.toFixed(2)),
        monthsToLiquidation: schedule.length,
      },
    };
  }
}
