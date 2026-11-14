/**
 * Hard 5-Minute Crypto & Short-Horizon Binary Contract Exclusion Guard.
 *
 * Enforces IC Resolution (p. 56): zero 5-minute crypto contracts (`btc-updown-5m`,
 * `5-minute`, `5 min`, `5m` paired with crypto underlyings) or explicit 5-minute
 * binary settlement contracts may ever be quoted or bundled in runtime or replay.
 */

export interface FiveMinuteGuardMarketLike {
  id?: string;
  slug?: string;
  question?: string;
  title?: string;
  groupItemTitle?: string;
  category?: string;
  tags?: ReadonlyArray<string>;
  outcomes?: ReadonlyArray<string>;
  durationSeconds?: number;
  windowSeconds?: number;
  resolutionWindowSeconds?: number;
  markets?: ReadonlyArray<FiveMinuteGuardMarketLike>;
}

export class FiveMinuteCryptoExclusionError extends Error {
  readonly code = 'FIVE_MINUTE_CRYPTO_EXCLUDED' as const;
  readonly targetId: string;

  constructor(targetId: string, reason: string) {
    super(`Excluded 5-minute contract (${targetId}): ${reason}`);
    this.name = 'FiveMinuteCryptoExclusionError';
    this.targetId = targetId;
  }
}

const EXPLICIT_UPDOWN_5M_RE = /(?:^|[-_\s/:()])(?:updown|up[-_\s]?or[-_\s]?down)[-_\s]?5m(?:$|[-_\s/:()])/i;

const FIVE_MINUTE_HORIZON_RE =
  /(?:^|[-_\s/:()])(?:5[-_\s]?minutes?|5[-_\s]?mins?|5m|300[-_\s]?seconds?|300s)(?:$|[-_\s/:()?.,!])/i;

const CRYPTO_TICKER_RE =
  /(?:^|[-_\s/:($])(?:btc|bitcoin|eth|ethereum|sol|solana|xrp|ripple|doge|dogecoin|bnb|avax|ada|ltc|link)(?:$|[-_\s/:)?.,!])/i;

const SHORT_BINARY_SETTLEMENT_RE =
  /(?:up\s+or\s+down|up\/down|updown|higher\s+or\s+lower|above\s+or\s+below|5[-_\s]?(?:minute|min|m)\s+(?:binary|candle|settlement|contract|market|window)|in\s+the\s+next\s+5\s*(?:minutes?|mins?)|resolves?\s+in\s+5\s*(?:minutes?|mins?))/i;

const FIVE_MINUTE_SECONDS = 300;

function collectTextSurface(target: FiveMinuteGuardMarketLike): string {
  const parts: string[] = [];
  if (target.slug) parts.push(target.slug);
  if (target.question) parts.push(target.question);
  if (target.title) parts.push(target.title);
  if (target.groupItemTitle) parts.push(target.groupItemTitle);
  if (target.category) parts.push(target.category);
  if (Array.isArray(target.tags)) {
    for (const tag of target.tags) {
      if (typeof tag === 'string' && tag.length > 0) parts.push(tag);
    }
  }
  return parts.join(' | ');
}

function hasExplicitFiveMinuteWindow(target: FiveMinuteGuardMarketLike): boolean {
  return (
    target.durationSeconds === FIVE_MINUTE_SECONDS ||
    target.windowSeconds === FIVE_MINUTE_SECONDS ||
    target.resolutionWindowSeconds === FIVE_MINUTE_SECONDS
  );
}

/**
 * Inspects a single market or event descriptor and returns the exclusion reason,
 * or `null` when the contract is permitted.
 */
export function classifyFiveMinuteExclusion(
  target: FiveMinuteGuardMarketLike | null | undefined,
): string | null {
  if (!target || typeof target !== 'object') return null;

  if (hasExplicitFiveMinuteWindow(target)) {
    return 'explicit-300s-settlement-window';
  }

  const text = collectTextSurface(target);
  if (text.length > 0) {
    if (EXPLICIT_UPDOWN_5M_RE.test(text)) {
      return 'updown-5m-contract';
    }
    if (FIVE_MINUTE_HORIZON_RE.test(text)) {
      if (CRYPTO_TICKER_RE.test(text)) {
        return 'five-minute-crypto-contract';
      }
      if (SHORT_BINARY_SETTLEMENT_RE.test(text)) {
        return 'five-minute-binary-settlement-contract';
      }
    }
  }

  if (Array.isArray(target.markets)) {
    for (const child of target.markets) {
      const childReason = classifyFiveMinuteExclusion(child);
      if (childReason !== null) return childReason;
    }
  }

  return null;
}

/** Deterministic boolean predicate: true iff the market or event is an excluded 5-minute contract. */
export function isFiveMinuteCryptoMarket(
  marketOrEvent: FiveMinuteGuardMarketLike | null | undefined,
): boolean {
  return classifyFiveMinuteExclusion(marketOrEvent) !== null;
}

/** Throws `FiveMinuteCryptoExclusionError` if `marketOrEvent` is an excluded 5-minute contract. */
export function assertNotFiveMinuteCryptoMarket(
  marketOrEvent: FiveMinuteGuardMarketLike | null | undefined,
  contextLabel?: string,
): void {
  const reason = classifyFiveMinuteExclusion(marketOrEvent);
  if (reason === null) return;
  const rawId =
    marketOrEvent?.slug ||
    marketOrEvent?.id ||
    contextLabel ||
    'unknown-market';
  throw new FiveMinuteCryptoExclusionError(rawId, reason);
}
