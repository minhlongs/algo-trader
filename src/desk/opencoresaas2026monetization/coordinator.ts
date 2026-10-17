import { OpenCoreSaasMonetizationCalculator } from './calculator';
import { OpenCoreSaaSEvaluation, OpenCoreSaaSTelemetry } from './types';

export class OpenCoreSaasMonetizationCoordinator {
  public static evaluate(t: OpenCoreSaaSTelemetry): OpenCoreSaaSEvaluation {
    const completionRatio = OpenCoreSaasMonetizationCalculator.computeCompletionRatio(
      t.completedRestructuringSteps
    );
    const { paidSubs, plgArrUsd, enterpriseArrUsd, totalArrUsd } =
      OpenCoreSaasMonetizationCalculator.computeTotalArrUsd(t);

    if (t.leakedSecretsCount > 0 || !t.licenseGateEnforced) {
      return {
        completionRatio,
        paidCloudSubscribers: paidSubs,
        monthlyPlgMcuArrUsd: plgArrUsd,
        enterpriseRbacArrUsd: enterpriseArrUsd,
        totalProjectedArrUsd: totalArrUsd,
        verdict: 'LEAK_OR_UNMETERED_BLOCKED',
        rationale: 'Secret leak detected or FastAPI/Worker JWT license gate disabled.',
      };
    }

    if (completionRatio < 1.0 || t.cloudConversionRate < 0.02) {
      return {
        completionRatio,
        paidCloudSubscribers: paidSubs,
        monthlyPlgMcuArrUsd: plgArrUsd,
        enterpriseRbacArrUsd: enterpriseArrUsd,
        totalProjectedArrUsd: totalArrUsd,
        verdict: 'SUBOPTIMAL_PLG_CONVERSION',
        rationale: 'Open-Core boundary safe, but 25-step restructuring or PLG upsell < 2%.',
      };
    }

    return {
      completionRatio,
      paidCloudSubscribers: paidSubs,
      monthlyPlgMcuArrUsd: plgArrUsd,
      enterpriseRbacArrUsd: enterpriseArrUsd,
      totalProjectedArrUsd: totalArrUsd,
      verdict: 'OPENCORE_SAAS_FLY_WHEEL_OPTIMAL',
      rationale: 'All 25 Open-Core steps complete with high-margin SaaS MCU + Enterprise ARR.',
    };
  }
}
