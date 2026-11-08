/**
 * Finiteness guard for the CLOB V2 pre-trade candidate.
 *
 * Every check in the ten-invariant gate is a comparison, and every comparison
 * involving `NaN` is false — so a `NaN` notional would clear the price cutoffs,
 * the tick grid, the min-size rule, and the balance reserve alike and emerge as an
 * allowed order that spends nothing. This runs first so that cannot happen.
 */

import type {
  PreTradeOrderCandidateV2,
  PreTradeValidationResultV2,
} from './polymarket-v2-pretrade-risk-gate';

export function allOrderTermsFinite(candidate: PreTradeOrderCandidateV2): boolean {
  return [
    candidate.priceMicro,
    candidate.sharesMicro,
    candidate.tickSizeMicro,
    candidate.rawFreeBalanceMicro,
    candidate.currentMarketExposureMicro ?? 0,
    candidate.currentVpin,
    candidate.clusterCvar99Pct,
    candidate.consecutiveBookErrors,
  ].every(Number.isFinite);
}

export function failNonFiniteOrderTerms(): PreTradeValidationResultV2 {
  return {
    allowed: false,
    reason: 'NON_FINITE_ORDER_TERMS',
    effectiveFreeBalanceMicro: 0,
    requiredNotionalMicro: Number.NaN,
    sanitizedNotionalMicro: Number.NaN,
  };
}
