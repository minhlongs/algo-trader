/**
 * Polymarket Data Rights Evaluator Across 7 Distinct Operational Scopes (#POLY-G10.5 Phase 4).
 *
 * Grounded in Polymarket Terms of Use (effective 2026-08-11, §§ 4.2 & 5.1) and
 * Polymarket Institutional / ICE Data Services terms (`institutional.polymarket.com`):
 * - Does NOT require a commercial data license for pure offline synthetic/fixture engineering.
 * - Does NOT assume public REST/WebSocket reachability grants archival scraping, redistribution,
 *   customer-facing display, or Capital Market Entity proprietary trading rights.
 * - Retains `DATA_LICENSE = HOLD` whenever operator classification is unverified or written
 *   permission is required and absent.
 */

import type {
  DataRightsScopeEvaluation,
  OperatorMarketClassification,
  PolymarketDataUseCase,
} from './venue-eligibility-types';

export const ALL_POLYMARKET_DATA_USE_CASES: readonly PolymarketDataUseCase[] = [
  'OFFLINE_SYNTHETIC_RESEARCH',
  'PERMITTED_INTERNAL_RESEARCH',
  'AUTOMATED_L2_COLLECTION',
  'HISTORICAL_RETENTION',
  'COMMERCIAL_DATA_DISTRIBUTION',
  'CUSTOMER_FACING_ANALYTICS',
  'PROPRIETARY_TRADING',
] as const;

export interface EvaluateDataRightsInput {
  readonly useCase: PolymarketDataUseCase;
  readonly operatorClassification?: OperatorMarketClassification;
  readonly writtenPermissionsGranted?: ReadonlySet<PolymarketDataUseCase>;
}

export function evaluatePolymarketDataRightsScope(
  input: EvaluateDataRightsInput,
): DataRightsScopeEvaluation {
  const classification = input.operatorClassification ?? 'UNVERIFIED';
  const hasWritten = input.writtenPermissionsGranted?.has(input.useCase) === true;

  if (input.useCase === 'OFFLINE_SYNTHETIC_RESEARCH') {
    return {
      useCase: input.useCase,
      status: 'PERMITTED_WITHOUT_EXTERNAL_FEED',
      dataLicenseGate: 'NOT_REQUIRED',
      requiresWrittenAgreement: false,
      rationale:
        'Pure local clean-room code, deterministic synthetic fixtures, and math/invariant tests consume zero Polymarket API/WS/on-chain feeds.',
    };
  }

  if (hasWritten) {
    return {
      useCase: input.useCase,
      status: 'CLEARANCE_GRANTED',
      dataLicenseGate: 'PASS',
      requiresWrittenAgreement: true,
      rationale: `Explicit written Polymarket / ICE authorization recorded for ${input.useCase}.`,
    };
  }

  const isCapitalMarketOrDistributor =
    classification === 'CAPITAL_MARKET_ENTITY' || classification === 'MARKET_DATA_DISTRIBUTOR';

  if (input.useCase === 'PERMITTED_INTERNAL_RESEARCH') {
    if (classification === 'INDIVIDUAL_NON_COMMERCIAL_RESEARCHER' && !isCapitalMarketOrDistributor) {
      return {
        useCase: input.useCase,
        status: 'PERMITTED_PERSONAL_INTERACTION_ONLY',
        dataLicenseGate: 'PASS',
        requiresWrittenAgreement: false,
        rationale:
          'ToS §5.1 personal, non-commercial, non-automated interaction by an eligible retail individual (excludes automated scraping, bulk archival, or redistribution).',
      };
    }
    return {
      useCase: input.useCase,
      status: 'HOLD',
      dataLicenseGate: 'HOLD',
      requiresWrittenAgreement: true,
      rationale:
        'Operator market classification is unverified or non-retail (§4.2 Capital Market Client / distributor restriction); retain DATA_LICENSE=HOLD until confirmed.',
    };
  }

  const scopeRationales: Record<
    Exclude<PolymarketDataUseCase, 'OFFLINE_SYNTHETIC_RESEARCH' | 'PERMITTED_INTERNAL_RESEARCH'>,
    string
  > = {
    AUTOMATED_L2_COLLECTION:
      'Continuous automated WebSocket/REST L2 orderbook capture intersects ToS §4.2 anti-scraping/harvesting and Capital Market Client rules; written Polymarket/ICE clearance required (DATA_LICENSE=HOLD).',
    HISTORICAL_RETENTION:
      'Multi-week WAL/Parquet cloud or local archival retention requires explicit written storage/retention clearance from Polymarket or an ICE Order Form (DATA_LICENSE=HOLD).',
    COMMERCIAL_DATA_DISTRIBUTION:
      'ToS §4.2 & §5.1 strictly prohibit selling, sublicensing, or redistributing raw, derived, aggregated, or anonymized Polymarket data without a written agreement (DATA_LICENSE=HOLD).',
    CUSTOMER_FACING_ANALYTICS:
      'Displaying raw, delayed, or derived Polymarket market data to external Paper Beta or SaaS users requires explicit written redistribution/display clearance (DATA_LICENSE=HOLD).',
    PROPRIETARY_TRADING:
      'Non-retail proprietary trading / market-making data consumption falls under ToS §4.2 Capital Market Entity consultation requirements with Polymarket and ICE unless confirmed retail or licensed in writing (DATA_LICENSE=HOLD).',
  };

  return {
    useCase: input.useCase,
    status: 'HOLD',
    dataLicenseGate: 'HOLD',
    requiresWrittenAgreement: true,
    rationale: scopeRationales[input.useCase],
  };
}

export function evaluateAllPolymarketDataRights(
  operatorClassification: OperatorMarketClassification = 'UNVERIFIED',
  writtenPermissionsGranted?: ReadonlySet<PolymarketDataUseCase>,
): Record<PolymarketDataUseCase, DataRightsScopeEvaluation> {
  const out = {} as Record<PolymarketDataUseCase, DataRightsScopeEvaluation>;
  for (const useCase of ALL_POLYMARKET_DATA_USE_CASES) {
    out[useCase] = evaluatePolymarketDataRightsScope({
      useCase,
      operatorClassification,
      writtenPermissionsGranted,
    });
  }
  return out;
}
