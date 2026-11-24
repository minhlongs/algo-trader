/**
 * Types for Global-First Strategic Profile, 8-Dimension Venue Eligibility,
 * 7-Scope Polymarket Data Rights, and 5 Activity-Scoped Governance Gates (#POLY-G10.5).
 */

export interface GlobalStrategicBaselineConfig {
  readonly TARGET_MARKET: 'INTERNATIONAL';
  readonly TARGET_VIETNAM_CUSTOMERS: false;
  readonly PRODUCT_LANGUAGE: 'en';
  readonly ACCOUNTING_CURRENCY: 'USD';
  readonly PRIMARY_VENUE: 'POLYMARKET_INTERNATIONAL';
  readonly LEGAL_FRAMEWORK: 'JURISDICTION_AWARE';
}

export const GLOBAL_STRATEGIC_BASELINE: GlobalStrategicBaselineConfig = {
  TARGET_MARKET: 'INTERNATIONAL',
  TARGET_VIETNAM_CUSTOMERS: false,
  PRODUCT_LANGUAGE: 'en',
  ACCOUNTING_CURRENCY: 'USD',
  PRIMARY_VENUE: 'POLYMARKET_INTERNATIONAL',
  LEGAL_FRAMEWORK: 'JURISDICTION_AWARE',
} as const;

export type VenueEligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
export type DimensionAssessmentStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN' | 'HOLD';

export type VenueEligibilityDimensionKey =
  | 'OPERATOR_CITIZENSHIP_AND_RESIDENCY'
  | 'PHYSICAL_OPERATING_LOCATION'
  | 'LEGAL_ENTITY_JURISDICTION'
  | 'PRINCIPAL_PLACE_OF_BUSINESS'
  | 'CUSTOMER_ELIGIBILITY'
  | 'SERVER_LOCATION'
  | 'PLATFORM_AUTHORIZATION'
  | 'DATA_USAGE_RIGHTS';

export interface DimensionAssessment {
  readonly dimension: VenueEligibilityDimensionKey;
  readonly status: DimensionAssessmentStatus;
  readonly detail: string;
}

export type PolymarketDataUseCase =
  | 'OFFLINE_SYNTHETIC_RESEARCH'
  | 'PERMITTED_INTERNAL_RESEARCH'
  | 'AUTOMATED_L2_COLLECTION'
  | 'HISTORICAL_RETENTION'
  | 'COMMERCIAL_DATA_DISTRIBUTION'
  | 'CUSTOMER_FACING_ANALYTICS'
  | 'PROPRIETARY_TRADING';

export type OperatorMarketClassification =
  | 'UNVERIFIED'
  | 'INDIVIDUAL_NON_COMMERCIAL_RESEARCHER'
  | 'CAPITAL_MARKET_ENTITY'
  | 'MARKET_DATA_DISTRIBUTOR';

export type DataRightsDecisionStatus =
  | 'PERMITTED_WITHOUT_EXTERNAL_FEED'
  | 'PERMITTED_PERSONAL_INTERACTION_ONLY'
  | 'CLEARANCE_GRANTED'
  | 'HOLD';

export interface DataRightsScopeEvaluation {
  readonly useCase: PolymarketDataUseCase;
  readonly status: DataRightsDecisionStatus;
  readonly dataLicenseGate: 'NOT_REQUIRED' | 'PASS' | 'HOLD';
  readonly requiresWrittenAgreement: boolean;
  readonly rationale: string;
}

export type ScopedGovernanceGateKey =
  | 'OFFLINE_ENGINEERING'
  | 'RESEARCH_DATA_RIGHTS'
  | 'INTERNATIONAL_PRODUCT_ELIGIBILITY'
  | 'OPERATOR_JURISDICTION_ELIGIBILITY'
  | 'LIVE_TRADING_ELIGIBILITY';

export type ScopedGovernanceGateStatus = 'PASS' | 'HOLD' | 'UNKNOWN' | 'INELIGIBLE' | 'DISABLED';

export interface JurisdictionCoordinate {
  readonly countryCode?: string | null;
  readonly regionCode?: string | null;
}

export interface AntiCircumventionFlags {
  readonly usesVpnOrProxy?: boolean;
  readonly usesLocationSpoofing?: boolean;
  readonly usesThirdPartyNomineeAccount?: boolean;
  readonly usesOffshoreEvasionArrangement?: boolean;
  readonly directedOrControlledByRestrictedPerson?: boolean;
}

export interface PolymarketVenueEligibilityInput {
  readonly operatorMode?: 'UNSPECIFIED' | 'SOLE_INDIVIDUAL' | 'LEGAL_ENTITY';
  readonly operatorCitizenship?: JurisdictionCoordinate;
  readonly operatorResidency?: JurisdictionCoordinate;
  readonly physicalOperatingLocation?: JurisdictionCoordinate;
  readonly legalEntityJurisdiction?: JurisdictionCoordinate;
  readonly principalPlaceOfBusiness?: JurisdictionCoordinate;
  readonly operatorApplicableLawCleared?: boolean;
  readonly customerJurisdiction?: JurisdictionCoordinate;
  readonly targetVietnamCustomers?: boolean;
  readonly serverLocation?: JurisdictionCoordinate;
  readonly platformTermsAccepted?: boolean;
  readonly liveGeoblockBlocked?: boolean | null;
  readonly operatorClassification?: OperatorMarketClassification;
  readonly requestedDataUseCase?: PolymarketDataUseCase;
  readonly writtenDataPermissionsGranted?: ReadonlySet<PolymarketDataUseCase>;
  readonly antiCircumvention?: AntiCircumventionFlags;
  readonly offlineEngineeringVerified?: boolean;
  readonly cloudflareB0PrivateIngressClosed?: boolean;
  readonly paperBetaDataDisplayCleared?: boolean;
  readonly economicG11Approved?: boolean;
  readonly founderG13Approved?: boolean;
}

export interface PolymarketVenueEligibilityReport {
  readonly strategicBaseline: GlobalStrategicBaselineConfig;
  readonly venueEligibility: VenueEligibilityStatus;
  readonly liveTradingEnabled: false | true;
  readonly realMoneyTrading: 'DISABLED' | 'ENABLED';
  readonly dataLicenseStatus: 'NOT_REQUIRED' | 'PASS' | 'HOLD';
  readonly antiCircumventionViolated: boolean;
  readonly serverSubstitutedForOperator: false;
  readonly dimensions: Record<VenueEligibilityDimensionKey, DimensionAssessment>;
  readonly scopedGates: Record<ScopedGovernanceGateKey, ScopedGovernanceGateStatus>;
  readonly blockingReasons: readonly string[];
}
