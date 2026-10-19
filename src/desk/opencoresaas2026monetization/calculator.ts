import { OpenCoreSaaSTelemetry } from './types';

/**
 * 25-Step Open-Core Public GitHub + SaaS Monetization Economics Calculator
 * Models the Product-Led Growth (PLG) funnel from MIT GitHub Clones -> Local CLI -> Cloud MCU & Enterprise RBAC ARR
 */
export class OpenCoreSaasMonetizationCalculator {
  public static computeCompletionRatio(steps: number): number {
    const clamped = Math.max(0, Math.min(25, steps));
    return clamped / 25;
  }

  public static computePaidSubscribers(activeDevs: number, conversionRate: number): number {
    if (activeDevs <= 0 || conversionRate <= 0) return 0;
    return Math.floor(activeDevs * Math.min(1, conversionRate));
  }

  public static computeTotalArrUsd(t: OpenCoreSaaSTelemetry): {
    paidSubs: number;
    plgArrUsd: number;
    enterpriseArrUsd: number;
    totalArrUsd: number;
  } {
    const paidSubs = this.computePaidSubscribers(t.activeCliDevelopers, t.cloudConversionRate);
    const plgArrUsd = paidSubs * Math.max(0, t.avgMonthlyMcuSpendUsd) * 12;
    const enterpriseArrUsd =
      Math.max(0, t.enterpriseSeatsCount) * Math.max(0, t.enterpriseSeatPriceUsd) * 12;
    return {
      paidSubs,
      plgArrUsd,
      enterpriseArrUsd,
      totalArrUsd: plgArrUsd + enterpriseArrUsd,
    };
  }
}
