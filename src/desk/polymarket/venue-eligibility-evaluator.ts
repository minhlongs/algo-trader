/**
 * Fail-Closed 8-Dimension Polymarket Venue Eligibility & 5-Gate Governance Evaluator (#POLY-G10.5).
 *
 * Hard Invariants:
 * 1. Server location (`eu-west-1`, etc.) NEVER substitutes for operator, entity, or physical location eligibility.
 * 2. VPN, proxy, location spoofing, nominee accounts, or offshore circumvention immediately force `INELIGIBLE`.
 * 3. Unverified operator/entity facts evaluate fail-closed to `VENUE_ELIGIBILITY = 'UNKNOWN'` and `LIVE_TRADING_ENABLED = false`.
 * 4. Unresolved legal or licensing requirements NEVER return `PASS`.
 */

import { evaluatePolymarketDataRightsScope } from './research-data-rights';
import { classifyPolymarketJurisdiction, normalizeCountryCode } from './venue-eligibility-jurisdictions';
import {
  GLOBAL_STRATEGIC_BASELINE,
  type AntiCircumventionFlags,
  type DimensionAssessment,
  type JurisdictionCoordinate,
  type PolymarketVenueEligibilityInput,
  type PolymarketVenueEligibilityReport,
  type ScopedGovernanceGateKey,
  type ScopedGovernanceGateStatus,
  type VenueEligibilityDimensionKey,
  type VenueEligibilityStatus,
} from './venue-eligibility-types';

interface BasicCheck {
  readonly status: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
  readonly detail: string;
}

function checkCoord(coord: JurisdictionCoordinate | undefined, label: string): BasicCheck {
  if (!coord || !coord.countryCode) return { status: 'UNKNOWN', detail: `${label} not provided` };
  const res = classifyPolymarketJurisdiction(coord.countryCode, coord.regionCode);
  if (res.tier === 'INVALID_OR_MISSING_CODE') return { status: 'UNKNOWN', detail: `${label}: ${res.reason}` };
  if (res.restrictedForTrading) return { status: 'INELIGIBLE', detail: `${label}: ${res.reason}` };
  return { status: 'ELIGIBLE', detail: `${label} (${res.normalizedRegion ?? res.normalizedCountry}) not venue-restricted` };
}

function hasCircumvention(flags: AntiCircumventionFlags | undefined): string | null {
  if (!flags) return null;
  if (flags.usesVpnOrProxy) return 'VPN or proxy circumvention is strictly prohibited (ToS §1, §4.1, §4.2)';
  if (flags.usesLocationSpoofing) return 'Location spoofing is strictly prohibited';
  if (flags.usesThirdPartyNomineeAccount) return 'Third-party/nominee account circumvention is prohibited (ToS §1)';
  if (flags.usesOffshoreEvasionArrangement) return 'Offshore entity evasion arrangement controlled by Restricted Person is prohibited (ToS §1)';
  if (flags.directedOrControlledByRestrictedPerson) return 'Activity directed, coordinated, or controlled by a Restricted Person is prohibited (ToS §1)';
  return null;
}

export function evaluatePolymarketVenueEligibility(
  input: PolymarketVenueEligibilityInput = {},
): PolymarketVenueEligibilityReport {
  const circumventionReason = hasCircumvention(input.antiCircumvention);
  const mode = input.operatorMode ?? 'UNSPECIFIED';
  const targetVn = input.targetVietnamCustomers ?? GLOBAL_STRATEGIC_BASELINE.TARGET_VIETNAM_CUSTOMERS;

  const cit = checkCoord(input.operatorCitizenship, 'Operator citizenship');
  const res = checkCoord(input.operatorResidency, 'Operator residency');
  const dim1Status =
    cit.status === 'INELIGIBLE' || res.status === 'INELIGIBLE'
      ? 'INELIGIBLE'
      : cit.status === 'ELIGIBLE' && res.status === 'ELIGIBLE'
        ? 'ELIGIBLE'
        : 'UNKNOWN';

  const phys = checkCoord(input.physicalOperatingLocation, 'Physical operating location');
  const ent =
    mode === 'SOLE_INDIVIDUAL'
      ? input.legalEntityJurisdiction?.countryCode
        ? checkCoord(input.legalEntityJurisdiction, 'Legal entity jurisdiction')
        : { status: 'ELIGIBLE' as const, detail: 'Individual sole operator (no separate corporate entity)' }
      : mode === 'LEGAL_ENTITY'
        ? checkCoord(input.legalEntityJurisdiction, 'Legal entity jurisdiction')
        : { status: 'UNKNOWN' as const, detail: 'Operator mode (individual vs legal entity) is unspecified' };
  const pob =
    mode === 'SOLE_INDIVIDUAL'
      ? input.principalPlaceOfBusiness?.countryCode
        ? checkCoord(input.principalPlaceOfBusiness, 'Principal place of business')
        : phys
      : mode === 'LEGAL_ENTITY'
        ? checkCoord(input.principalPlaceOfBusiness, 'Principal place of business')
        : { status: 'UNKNOWN' as const, detail: 'Principal place of business unspecified' };

  const custCountry = normalizeCountryCode(input.customerJurisdiction?.countryCode);
  const custCheck = input.customerJurisdiction
    ? custCountry === 'VN' && !targetVn
      ? { status: 'INELIGIBLE' as const, detail: 'Vietnam is excluded from target customer markets (TARGET_VIETNAM_CUSTOMERS=false)' }
      : checkCoord(input.customerJurisdiction, 'Customer jurisdiction')
    : { status: 'UNKNOWN' as const, detail: 'No external customer jurisdiction evaluated in current context' };

  const srv = checkCoord(input.serverLocation, 'Server location');
  const authStatus: DimensionAssessment['status'] = circumventionReason || input.liveGeoblockBlocked === true
    ? 'INELIGIBLE'
    : input.platformTermsAccepted === true && input.liveGeoblockBlocked === false
      ? 'ELIGIBLE'
      : 'UNKNOWN';

  const requestedUseCase = input.requestedDataUseCase ?? 'AUTOMATED_L2_COLLECTION';
  const dataEval = evaluatePolymarketDataRightsScope({
    useCase: requestedUseCase,
    operatorClassification: input.operatorClassification,
    writtenPermissionsGranted: input.writtenDataPermissionsGranted,
  });
  const propTradingDataEval = evaluatePolymarketDataRightsScope({
    useCase: 'PROPRIETARY_TRADING',
    operatorClassification: input.operatorClassification,
    writtenPermissionsGranted: input.writtenDataPermissionsGranted,
  });
  const dataDimStatus: DimensionAssessment['status'] = circumventionReason
    ? 'INELIGIBLE'
    : dataEval.dataLicenseGate === 'HOLD'
      ? 'HOLD'
      : 'ELIGIBLE';

  const dimensions: Record<VenueEligibilityDimensionKey, DimensionAssessment> = {
    OPERATOR_CITIZENSHIP_AND_RESIDENCY: { dimension: 'OPERATOR_CITIZENSHIP_AND_RESIDENCY', status: dim1Status, detail: `${cit.detail}; ${res.detail}` },
    PHYSICAL_OPERATING_LOCATION: { dimension: 'PHYSICAL_OPERATING_LOCATION', status: phys.status, detail: phys.detail },
    LEGAL_ENTITY_JURISDICTION: { dimension: 'LEGAL_ENTITY_JURISDICTION', status: ent.status, detail: ent.detail },
    PRINCIPAL_PLACE_OF_BUSINESS: { dimension: 'PRINCIPAL_PLACE_OF_BUSINESS', status: pob.status, detail: pob.detail },
    CUSTOMER_ELIGIBILITY: { dimension: 'CUSTOMER_ELIGIBILITY', status: custCheck.status, detail: custCheck.detail },
    SERVER_LOCATION: { dimension: 'SERVER_LOCATION', status: srv.status, detail: `${srv.detail} (never substitutes for operator eligibility)` },
    PLATFORM_AUTHORIZATION: { dimension: 'PLATFORM_AUTHORIZATION', status: authStatus, detail: circumventionReason ?? (authStatus === 'ELIGIBLE' ? 'Platform ToS & geoblock verified' : 'Platform authorization / live geoblock unverified') },
    DATA_USAGE_RIGHTS: { dimension: 'DATA_USAGE_RIGHTS', status: dataDimStatus, detail: dataEval.rationale },
  };

  const operatorCoreDims = [dim1Status, phys.status, ent.status, pob.status] as const;
  const anyOperatorIneligible = Boolean(circumventionReason) || operatorCoreDims.includes('INELIGIBLE') || srv.status === 'INELIGIBLE' || authStatus === 'INELIGIBLE';
  const allOperatorVenueEligible =
    !anyOperatorIneligible &&
    operatorCoreDims.every((s) => s === 'ELIGIBLE') &&
    srv.status === 'ELIGIBLE' &&
    authStatus === 'ELIGIBLE' &&
    input.operatorApplicableLawCleared === true;

  const venueEligibility: VenueEligibilityStatus = anyOperatorIneligible
    ? 'INELIGIBLE'
    : allOperatorVenueEligible
      ? 'ELIGIBLE'
      : 'UNKNOWN';

  const operatorGate: ScopedGovernanceGateStatus = anyOperatorIneligible
    ? 'INELIGIBLE'
    : allOperatorVenueEligible
      ? 'PASS'
      : input.operatorApplicableLawCleared === false
        ? 'HOLD'
        : 'UNKNOWN';

  // RESEARCH_DATA_RIGHTS passes ONLY when explicit external data clearance is PASS (never from OFFLINE_SYNTHETIC_RESEARCH = NOT_REQUIRED).
  const researchDataGate: ScopedGovernanceGateStatus = circumventionReason
    ? 'INELIGIBLE'
    : dataEval.dataLicenseGate === 'PASS'
      ? 'PASS'
      : 'HOLD';

  const intlProductGate: ScopedGovernanceGateStatus =
    circumventionReason || custCheck.status === 'INELIGIBLE'
      ? 'INELIGIBLE'
      : input.cloudflareB0PrivateIngressClosed === true && input.paperBetaDataDisplayCleared === true
        ? 'PASS'
        : 'HOLD';

  const liveTradingEligible =
    venueEligibility === 'ELIGIBLE' &&
    operatorGate === 'PASS' &&
    researchDataGate === 'PASS' &&
    propTradingDataEval.dataLicenseGate === 'PASS' &&
    input.economicG11Approved === true &&
    input.founderG13Approved === true;

  const scopedGates: Record<ScopedGovernanceGateKey, ScopedGovernanceGateStatus> = {
    OFFLINE_ENGINEERING: circumventionReason ? 'INELIGIBLE' : input.offlineEngineeringVerified === false ? 'HOLD' : 'PASS',
    RESEARCH_DATA_RIGHTS: researchDataGate,
    INTERNATIONAL_PRODUCT_ELIGIBILITY: intlProductGate,
    OPERATOR_JURISDICTION_ELIGIBILITY: operatorGate,
    LIVE_TRADING_ELIGIBILITY: anyOperatorIneligible ? 'INELIGIBLE' : liveTradingEligible ? 'PASS' : 'DISABLED',
  };

  const blockingReasons: string[] = [];
  if (circumventionReason) blockingReasons.push(circumventionReason);
  for (const d of Object.values(dimensions)) {
    if (d.status !== 'ELIGIBLE') blockingReasons.push(`${d.dimension}=${d.status}: ${d.detail}`);
  }
  if (propTradingDataEval.dataLicenseGate !== 'PASS') blockingReasons.push('PROPRIETARY_TRADING_DATA_RIGHTS=HOLD');
  if (input.operatorApplicableLawCleared !== true) blockingReasons.push('OPERATOR_APPLICABLE_LAW=HOLD');
  if (input.economicG11Approved !== true) blockingReasons.push('ECONOMIC_G11=HOLD');
  if (input.founderG13Approved !== true) blockingReasons.push('FOUNDER_G13=HOLD');

  return {
    strategicBaseline: GLOBAL_STRATEGIC_BASELINE,
    venueEligibility,
    liveTradingEnabled: liveTradingEligible,
    realMoneyTrading: liveTradingEligible ? 'ENABLED' : 'DISABLED',
    dataLicenseStatus: dataEval.dataLicenseGate,
    antiCircumventionViolated: Boolean(circumventionReason),
    serverSubstitutedForOperator: false,
    dimensions,
    scopedGates,
    blockingReasons,
  };
}
