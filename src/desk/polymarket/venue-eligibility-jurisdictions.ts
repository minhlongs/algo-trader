/**
 * Re-exports the canonical Polymarket Jurisdiction & Geographic Restriction Tables
 * from `src/shared/polymarket/` so `src/desk/` and `src/platform/` share one source of truth.
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
} from '../../shared/polymarket/venue-eligibility-jurisdictions';
