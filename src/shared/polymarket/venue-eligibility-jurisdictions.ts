/**
 * Canonical Polymarket Jurisdiction & Geographic Restriction Tables.
 *
 * Verified against:
 * 1. Polymarket Terms of Use (effective 2026-08-11, Adventure One QSS, Inc., §1 & §4.1)
 * 2. Official Polymarket Geographic Restrictions (`https://docs.polymarket.com/api-reference/geoblock`)
 *
 * Placed in `src/shared/polymarket/` so both `src/desk/` and `src/platform/` share one
 * implementation while honoring `tests/integration/desk-platform-boundary.test.ts`.
 */

export type PolymarketRestrictionTier =
  | 'UNRESTRICTED_ON_VENUE_LIST'
  | 'FRONTEND_CLOSE_ONLY'
  | 'API_AND_FRONTEND_CLOSE_ONLY'
  | 'OFAC_COMPLETE_BLOCK'
  | 'INVALID_OR_MISSING_CODE';

export interface PolymarketJurisdictionCheck {
  readonly normalizedCountry: string | null;
  readonly normalizedRegion: string | null;
  readonly tier: PolymarketRestrictionTier;
  readonly restrictedForTrading: boolean;
  readonly reason: string;
}

/** OFAC-Sanctioned countries — complete block on both Frontend and API. */
export const POLYMARKET_OFAC_COUNTRIES: ReadonlySet<string> = new Set([
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
]);

/** OFAC-Sanctioned sub-national regions — complete block on both Frontend and API. */
export const POLYMARKET_OFAC_REGIONS: ReadonlySet<string> = new Set([
  'UA-09', // Luhansk
  'UA-14', // Donetsk
  'UA-43', // Crimea
]);

/**
 * Regulatory-restricted countries (Close-Only on Frontend and API per Geoblock docs,
 * plus Hungary `HU` explicitly listed in Polymarket ToS §1 Restricted Person header).
 */
export const POLYMARKET_CLOSE_ONLY_API_AND_FRONTEND_COUNTRIES: ReadonlySet<string> = new Set([
  'AR', 'AU', 'BE', 'BI', 'BR', 'BY', 'CD', 'CF', 'DE', 'ET',
  'FR', 'GB', 'HU', 'IQ', 'IT', 'LB', 'LY', 'MM', 'NI', 'NZ',
  'PL', 'RU', 'SD', 'SG', 'SI', 'SK', 'SO', 'SS', 'TH', 'TW',
  'UM', 'US', 'VE', 'YE', 'ZW',
]);

/** Regulatory-restricted Canadian provinces (Close-Only on Frontend and API, + ToS §1). */
export const POLYMARKET_CLOSE_ONLY_SUBDIVISIONS: ReadonlySet<string> = new Set([
  'CA-AB', // Alberta
  'CA-BC', // British Columbia
  'CA-ON', // Ontario
  'CA-QC', // Quebec
]);

/**
 * Regulatory-restricted countries (Close-Only on Frontend; ToS §1 also names IE & NL
 * as Restricted Person territories; MT is restricted for Sports on frontend).
 */
export const POLYMARKET_FRONTEND_CLOSE_ONLY_COUNTRIES: ReadonlySet<string> = new Set([
  'IE', // Ireland (also named in ToS §1)
  'JP', // Japan
  'KR', // South Korea
  'MT', // Malta (Sports close-only on frontend)
  'NL', // Netherlands (also named in ToS §1)
]);

/** Countries whose sub-national region MUST be known before clearing venue eligibility. */
export const COUNTRIES_REQUIRING_REGION_DISAMBIGUATION: ReadonlySet<string> = new Set([
  'CA', // Must distinguish CA-AB/BC/ON/QC from unrestricted provinces
  'UA', // Must distinguish UA-09/14/43 from non-sanctioned regions
]);

const ISO_ALPHA2_RE = /^[A-Z]{2}$/;
const SUBDIVISION_SUFFIX_RE = /^[A-Z0-9]{1,3}$/;

export function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  if (!ISO_ALPHA2_RE.test(trimmed)) return null;
  if (trimmed === 'XX' || trimmed === 'T1') return null; // Cloudflare unknown / Tor exit codes
  return trimmed;
}

export function normalizeSubdivisionCode(
  countryCode: string | null,
  rawRegion: string | null | undefined,
): string | null {
  if (!countryCode || typeof rawRegion !== 'string') return null;
  const trimmed = rawRegion.trim().toUpperCase();
  if (!trimmed) return null;
  if (trimmed.startsWith(`${countryCode}-`)) {
    const suffix = trimmed.slice(countryCode.length + 1);
    return SUBDIVISION_SUFFIX_RE.test(suffix) ? `${countryCode}-${suffix}` : null;
  }
  return SUBDIVISION_SUFFIX_RE.test(trimmed) ? `${countryCode}-${trimmed}` : null;
}

/**
 * Classifies a jurisdiction against Polymarket's official ToS (§1, §4.1) and Geoblock tiers.
 * Fail-closed: missing/invalid ISO codes or undisambiguated `CA`/`UA` sub-regions are flagged restricted.
 */
export function classifyPolymarketJurisdiction(
  countryRaw: string | null | undefined,
  regionRaw?: string | null | undefined,
): PolymarketJurisdictionCheck {
  const country = normalizeCountryCode(countryRaw);
  if (!country) {
    return {
      normalizedCountry: null,
      normalizedRegion: null,
      tier: 'INVALID_OR_MISSING_CODE',
      restrictedForTrading: true,
      reason: 'Missing, invalid, or anonymized ISO-3166 country code',
    };
  }
  const region = normalizeSubdivisionCode(country, regionRaw);

  if (POLYMARKET_OFAC_COUNTRIES.has(country) || (region !== null && POLYMARKET_OFAC_REGIONS.has(region))) {
    return {
      normalizedCountry: country,
      normalizedRegion: region,
      tier: 'OFAC_COMPLETE_BLOCK',
      restrictedForTrading: true,
      reason: `OFAC-sanctioned territory (${region ?? country}) is completely blocked`,
    };
  }

  if (
    POLYMARKET_CLOSE_ONLY_API_AND_FRONTEND_COUNTRIES.has(country) ||
    (region !== null && POLYMARKET_CLOSE_ONLY_SUBDIVISIONS.has(region))
  ) {
    return {
      normalizedCountry: country,
      normalizedRegion: region,
      tier: 'API_AND_FRONTEND_CLOSE_ONLY',
      restrictedForTrading: true,
      reason: `Regulatory-restricted jurisdiction (${region ?? country}) is prohibited for trading`,
    };
  }

  if (COUNTRIES_REQUIRING_REGION_DISAMBIGUATION.has(country) && region === null) {
    return {
      normalizedCountry: country,
      normalizedRegion: null,
      tier: 'INVALID_OR_MISSING_CODE',
      restrictedForTrading: true,
      reason: `Country ${country} requires explicit ISO-3166-2 region code to rule out restricted subdivisions`,
    };
  }

  if (POLYMARKET_FRONTEND_CLOSE_ONLY_COUNTRIES.has(country)) {
    return {
      normalizedCountry: country,
      normalizedRegion: region,
      tier: 'FRONTEND_CLOSE_ONLY',
      restrictedForTrading: true,
      reason: `Jurisdiction ${country} is subject to Polymarket frontend/ToS restrictions`,
    };
  }

  return {
    normalizedCountry: country,
    normalizedRegion: region,
    tier: 'UNRESTRICTED_ON_VENUE_LIST',
    restrictedForTrading: false,
    reason: `${region ?? country} is not listed on Polymarket's OFAC or regulatory geoblock lists (local law still applies)`,
  };
}
