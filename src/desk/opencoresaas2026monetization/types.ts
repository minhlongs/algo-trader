export type OpenCoreSaaSVerdict =
  | 'LEAK_OR_UNMETERED_BLOCKED'
  | 'SUBOPTIMAL_PLG_CONVERSION'
  | 'OPENCORE_SAAS_FLY_WHEEL_OPTIMAL';

export interface OpenCoreSaaSTelemetry {
  readonly completedRestructuringSteps: number;
  readonly monthlyGitHubClones: number;
  readonly activeCliDevelopers: number;
  readonly cloudConversionRate: number;
  readonly avgMonthlyMcuSpendUsd: number;
  readonly enterpriseSeatsCount: number;
  readonly enterpriseSeatPriceUsd: number;
  readonly leakedSecretsCount: number;
  readonly licenseGateEnforced: boolean;
}

export interface OpenCoreSaaSEvaluation {
  readonly completionRatio: number;
  readonly paidCloudSubscribers: number;
  readonly monthlyPlgMcuArrUsd: number;
  readonly enterpriseRbacArrUsd: number;
  readonly totalProjectedArrUsd: number;
  readonly verdict: OpenCoreSaaSVerdict;
  readonly rationale: string;
}
