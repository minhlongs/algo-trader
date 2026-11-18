/**
 * Re-exports the canonical 5-Minute Crypto Exclusion Guard from `src/shared/polymarket/`
 * so both `src/desk/` and `src/platform/` share one implementation cleanly.
 */

export {
  FiveMinuteCryptoExclusionError,
  assertNotFiveMinuteCryptoMarket,
  classifyFiveMinuteExclusion,
  isFiveMinuteCryptoMarket,
  type FiveMinuteGuardMarketLike,
} from '../../shared/polymarket/five-minute-crypto-guard';
