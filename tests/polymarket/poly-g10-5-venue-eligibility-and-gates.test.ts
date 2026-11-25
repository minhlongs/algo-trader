import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIN_QUALIFYING_MAKER_FILLS,
  MIN_RECORDED_L2_DAYS,
  MIN_RESOLVED_OOS_FORECASTS,
  evaluateICKpiScorecard,
} from '../../src/desk/polymarket/ic-kpi-scorecard';
import {
  ALL_POLYMARKET_DATA_USE_CASES,
  GLOBAL_STRATEGIC_BASELINE,
  classifyPolymarketJurisdiction,
  evaluateAllPolymarketDataRights,
  evaluatePolymarketDataRightsScope,
  evaluatePolymarketVenueEligibility,
} from '../../src/desk/polymarket/venue-eligibility';

describe('#POLY-G10.5 — Global-First Venue Eligibility, Data Rights & Scoped Gates', () => {
  it('enforces the exact global-first strategic baseline constants', () => {
    expect(GLOBAL_STRATEGIC_BASELINE).toEqual({
      TARGET_MARKET: 'INTERNATIONAL',
      TARGET_VIETNAM_CUSTOMERS: false,
      PRODUCT_LANGUAGE: 'en',
      ACCOUNTING_CURRENCY: 'USD',
      PRIMARY_VENUE: 'POLYMARKET_INTERNATIONAL',
      LEGAL_FRAMEWORK: 'JURISDICTION_AWARE',
    });
  });

  it('defaults fail-closed to VENUE_ELIGIBILITY=UNKNOWN and LIVE_TRADING_ENABLED=false when operator facts are unverified', () => {
    const report = evaluatePolymarketVenueEligibility();
    expect(report.venueEligibility).toBe('UNKNOWN');
    expect(report.liveTradingEnabled).toBe(false);
    expect(report.realMoneyTrading).toBe('DISABLED');
    expect(report.dataLicenseStatus).toBe('HOLD');
    expect(report.serverSubstitutedForOperator).toBe(false);
    expect(report.scopedGates).toEqual({
      OFFLINE_ENGINEERING: 'PASS',
      RESEARCH_DATA_RIGHTS: 'HOLD',
      INTERNATIONAL_PRODUCT_ELIGIBILITY: 'HOLD',
      OPERATOR_JURISDICTION_ELIGIBILITY: 'UNKNOWN',
      LIVE_TRADING_ELIGIBILITY: 'DISABLED',
    });
  });

  it('never allows an eligible server location to substitute for unknown or ineligible operator eligibility', () => {
    const unknownOpWithValidServer = evaluatePolymarketVenueEligibility({
      serverLocation: { countryCode: 'NO' },
      platformTermsAccepted: true,
      liveGeoblockBlocked: false,
    });
    expect(unknownOpWithValidServer.dimensions.SERVER_LOCATION.status).toBe('ELIGIBLE');
    expect(unknownOpWithValidServer.venueEligibility).toBe('UNKNOWN');
    expect(unknownOpWithValidServer.liveTradingEnabled).toBe(false);

    const restrictedOpWithValidServer = evaluatePolymarketVenueEligibility({
      operatorMode: 'SOLE_INDIVIDUAL',
      operatorCitizenship: { countryCode: 'US' },
      operatorResidency: { countryCode: 'US' },
      physicalOperatingLocation: { countryCode: 'US' },
      serverLocation: { countryCode: 'NO' },
      platformTermsAccepted: true,
      liveGeoblockBlocked: false,
      operatorApplicableLawCleared: true,
    });
    expect(restrictedOpWithValidServer.dimensions.SERVER_LOCATION.status).toBe('ELIGIBLE');
    expect(restrictedOpWithValidServer.venueEligibility).toBe('INELIGIBLE');
    expect(restrictedOpWithValidServer.scopedGates.OPERATOR_JURISDICTION_ELIGIBILITY).toBe('INELIGIBLE');
    expect(restrictedOpWithValidServer.scopedGates.LIVE_TRADING_ELIGIBILITY).toBe('INELIGIBLE');
    expect(restrictedOpWithValidServer.liveTradingEnabled).toBe(false);
  });

  it('hard-blocks VPN, proxy, spoofing, nominee, and offshore-evasion flags across all gates', () => {
    for (const flagKey of [
      'usesVpnOrProxy',
      'usesLocationSpoofing',
      'usesThirdPartyNomineeAccount',
      'usesOffshoreEvasionArrangement',
      'directedOrControlledByRestrictedPerson',
    ] as const) {
      const report = evaluatePolymarketVenueEligibility({
        operatorMode: 'LEGAL_ENTITY',
        operatorCitizenship: { countryCode: 'CH' },
        operatorResidency: { countryCode: 'CH' },
        physicalOperatingLocation: { countryCode: 'CH' },
        legalEntityJurisdiction: { countryCode: 'CH' },
        principalPlaceOfBusiness: { countryCode: 'CH' },
        serverLocation: { countryCode: 'NO' },
        platformTermsAccepted: true,
        liveGeoblockBlocked: false,
        operatorApplicableLawCleared: true,
        cloudflareB0PrivateIngressClosed: true,
        paperBetaDataDisplayCleared: true,
        operatorClassification: 'INDIVIDUAL_NON_COMMERCIAL_RESEARCHER',
        requestedDataUseCase: 'PERMITTED_INTERNAL_RESEARCH',
        antiCircumvention: { [flagKey]: true },
      });
      expect(report.antiCircumventionViolated).toBe(true);
      expect(report.venueEligibility).toBe('INELIGIBLE');
      expect(report.scopedGates.OFFLINE_ENGINEERING).toBe('INELIGIBLE');
      expect(report.scopedGates.RESEARCH_DATA_RIGHTS).toBe('INELIGIBLE');
      expect(report.scopedGates.INTERNATIONAL_PRODUCT_ELIGIBILITY).toBe('INELIGIBLE');
      expect(report.scopedGates.LIVE_TRADING_ELIGIBILITY).toBe('INELIGIBLE');
      expect(report.liveTradingEnabled).toBe(false);
    }

    // OFFLINE_SYNTHETIC_RESEARCH (NOT_REQUIRED) must NEVER flip RESEARCH_DATA_RIGHTS or liveTradingEnabled to PASS/true
    const syntheticLiveAttempt = evaluatePolymarketVenueEligibility({
      operatorMode: 'LEGAL_ENTITY',
      operatorCitizenship: { countryCode: 'CH' },
      operatorResidency: { countryCode: 'CH' },
      physicalOperatingLocation: { countryCode: 'CH' },
      legalEntityJurisdiction: { countryCode: 'CH' },
      principalPlaceOfBusiness: { countryCode: 'CH' },
      serverLocation: { countryCode: 'NO' },
      platformTermsAccepted: true,
      liveGeoblockBlocked: false,
      operatorApplicableLawCleared: true,
      operatorClassification: 'CAPITAL_MARKET_ENTITY',
      requestedDataUseCase: 'OFFLINE_SYNTHETIC_RESEARCH',
      economicG11Approved: true,
      founderG13Approved: true,
    });
    expect(syntheticLiveAttempt.scopedGates.RESEARCH_DATA_RIGHTS).toBe('HOLD');
    expect(syntheticLiveAttempt.scopedGates.LIVE_TRADING_ELIGIBILITY).toBe('DISABLED');
    expect(syntheticLiveAttempt.liveTradingEnabled).toBe(false);
  });

  it('classifies OFAC, API close-only, frontend close-only, and sub-national CA/UA regions accurately', () => {
    expect(classifyPolymarketJurisdiction('IR').tier).toBe('OFAC_COMPLETE_BLOCK');
    expect(classifyPolymarketJurisdiction('UA', '43').tier).toBe('OFAC_COMPLETE_BLOCK');
    expect(classifyPolymarketJurisdiction('UA').tier).toBe('INVALID_OR_MISSING_CODE');
    expect(classifyPolymarketJurisdiction('UA', '30').restrictedForTrading).toBe(false);
    expect(classifyPolymarketJurisdiction('US').tier).toBe('API_AND_FRONTEND_CLOSE_ONLY');
    expect(classifyPolymarketJurisdiction('SG').tier).toBe('API_AND_FRONTEND_CLOSE_ONLY');
    expect(classifyPolymarketJurisdiction('CA', 'ON').tier).toBe('API_AND_FRONTEND_CLOSE_ONLY');
    expect(classifyPolymarketJurisdiction('CA').tier).toBe('INVALID_OR_MISSING_CODE');
    expect(classifyPolymarketJurisdiction('CA', 'MB').restrictedForTrading).toBe(false);
    expect(classifyPolymarketJurisdiction('IE').tier).toBe('FRONTEND_CLOSE_ONLY');
    expect(classifyPolymarketJurisdiction('CH').restrictedForTrading).toBe(false);
    expect(classifyPolymarketJurisdiction('XX').restrictedForTrading).toBe(true);
  });

  it('separates the 7 Polymarket data-rights scopes without conflating offline synthetic research and external capture', () => {
    expect(ALL_POLYMARKET_DATA_USE_CASES).toHaveLength(7);
    const matrix = evaluateAllPolymarketDataRights('UNVERIFIED');
    expect(matrix.OFFLINE_SYNTHETIC_RESEARCH.dataLicenseGate).toBe('NOT_REQUIRED');
    expect(matrix.PERMITTED_INTERNAL_RESEARCH.dataLicenseGate).toBe('HOLD');
    expect(matrix.AUTOMATED_L2_COLLECTION.dataLicenseGate).toBe('HOLD');
    expect(matrix.HISTORICAL_RETENTION.dataLicenseGate).toBe('HOLD');
    expect(matrix.COMMERCIAL_DATA_DISTRIBUTION.dataLicenseGate).toBe('HOLD');
    expect(matrix.CUSTOMER_FACING_ANALYTICS.dataLicenseGate).toBe('HOLD');
    expect(matrix.PROPRIETARY_TRADING.dataLicenseGate).toBe('HOLD');

    const retailManual = evaluatePolymarketDataRightsScope({
      useCase: 'PERMITTED_INTERNAL_RESEARCH',
      operatorClassification: 'INDIVIDUAL_NON_COMMERCIAL_RESEARCHER',
    });
    expect(retailManual.dataLicenseGate).toBe('PASS');

    const writtenL2 = evaluatePolymarketDataRightsScope({
      useCase: 'AUTOMATED_L2_COLLECTION',
      operatorClassification: 'CAPITAL_MARKET_ENTITY',
      writtenPermissionsGranted: new Set(['AUTOMATED_L2_COLLECTION']),
    });
    expect(writtenL2.dataLicenseGate).toBe('PASS');
  });

  it('preserves IC_DAY_0=null, W_SKILL=0, and all 30d/500-fill/150-OOS scientific floors in manifest & scorecard', () => {
    expect(MIN_RECORDED_L2_DAYS).toBe(30);
    expect(MIN_QUALIFYING_MAKER_FILLS).toBe(500);
    expect(MIN_RESOLVED_OOS_FORECASTS).toBe(150);

    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, '../../docs/poly-g8-4/ic-roadmap-manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest.icDay0).toBeNull();
    expect((manifest.governanceLocks as Record<string, unknown>).w_skill).toBe(0);
    expect((manifest.governanceLocks as Record<string, unknown>).ECONOMIC_G11).toBe('HOLD');
    expect((manifest.governanceLocks as Record<string, unknown>).FOUNDER_G13).toBe('HOLD');
    expect((manifest.governanceLocks as Record<string, unknown>).REAL_MONEY_TRADING).toBe('DISABLED');

    const scorecard = evaluateICKpiScorecard({
      mode: 'sim',
      strategyClass: 'mm',
      samples: { recordedL2Days: 0, qualifyingMakerFills: 0, resolvedOosForecasts: 0 },
    });
    expect(scorecard.verdicts.ECONOMIC_G11).toBe('HOLD');
    expect(scorecard.verdicts.FOUNDER_G13).toBe('HOLD');
    expect(scorecard.verdicts.REAL_MONEY_TRADING).toBe('DISABLED');
  });
});
