/**
 * Resolves the CLOB outcome token ID for a Polymarket binary market side.
 *
 * Never falls back to `yesTokenId` on `'no'` entries: missing `noTokenId`
 * returns `null` so callers skip the trade instead of buying the opposite side.
 */

export interface OutcomeTokenMarketLike {
  yesTokenId?: string | null;
  noTokenId?: string | null;
}

export function resolveOutcomeTokenId(
  market: OutcomeTokenMarketLike,
  side: 'yes' | 'no',
): string | null {
  const raw = side === 'yes' ? market.yesTokenId : market.noTokenId;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
