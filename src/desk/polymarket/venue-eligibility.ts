/**
 * Public Barrel — Polymarket Jurisdiction, Venue Eligibility, Data Rights & Scoped Gates (#POLY-G10.5).
 */

export {
  COUNTRIES_REQUIRING_REGION_DISAMBIGUATION,
  POLYMARKET_CLOSE_ONLY_API_AND_FRONTEND_COUNTRIES,
  POLYMARKET_CLOSE_ONLY_SUBDIVISIONS,
  POLYMARKET_FRONTEND_CLOSE_ONLY_COUNTRIES,
  POLYMARKET_OFAC_COUNTRIES,
  POLYMARKET_OFAC_REGIONS,
  classifyPolymarketJurisdiction,
  normalizeCountryCode,
  normalizeSubdivisionCode,
  type PolymarketJurisdictionCheck,
  type PolymarketRestrictionTier,
} from './venue-eligibility-jurisdictions';

export {
  GLOBAL_STRATEGIC_BASELINE,
  type AntiCircumventionFlags,
  type DataRightsDecisionStatus,
  type DataRightsScopeEvaluation,
  type DimensionAssessment,
  type DimensionAssessmentStatus,
  type GlobalStrategicBaselineConfig,
  type JurisdictionCoordinate,
  type OperatorMarketClassification,
  type PolymarketDataUseCase,
  type PolymarketVenueEligibilityInput,
  type PolymarketVenueEligibilityReport,
  type ScopedGovernanceGateKey,
  type ScopedGovernanceGateStatus,
  type VenueEligibilityDimensionKey,
  type VenueEligibilityStatus,
} from './venue-eligibility-types';

export {
  ALL_POLYMARKET_DATA_USE_CASES,
  evaluateAllPolymarketDataRights,
  evaluatePolymarketDataRightsScope,
  type EvaluateDataRightsInput,
} from './research-data-rights';

export { evaluatePolymarketVenueEligibility } from './venue-eligibility-evaluator';
