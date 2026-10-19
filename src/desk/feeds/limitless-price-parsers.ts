/**
 * Limitless Exchange Price Feed — Market Parsing & Normalization Helpers
 */

export interface LimitlessMarket {
  id: string;
  title: string;
  yesPrice: number;   // normalized 0–1
  noPrice: number;    // normalized 0–1
  volume: number;
  platform: 'limitless';
  lastUpdated: number;
}

export interface LimitlessFeed {
  markets: LimitlessMarket[];
  fetchedAt: number;
}

export interface LimitlessRawMarket {
  id?: string;
  title?: string;
  question?: string;
  outcomePrices?: string[] | number[];  // [yesCents, noCents] as strings or numbers
  volume?: number;
  volumeFormatted?: string;
  active?: boolean;
  closed?: boolean;
}

export interface LimitlessMarketsResponse {
  markets?: LimitlessRawMarket[];
  data?: LimitlessRawMarket[];
}

/** Parse price value which may be string "0.75" or number 75 (cents) */
export function parsePrice(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return 0;
  // If value > 1, treat as cents (0–100) → convert to probability
  return n > 1 ? Math.min(1, Math.max(0, n / 100)) : Math.min(1, Math.max(0, n));
}

export function normalize(raw: LimitlessRawMarket): LimitlessMarket | null {
  const id = raw.id;
  if (!id) return null;
  const prices = raw.outcomePrices ?? [];
  return {
    id,
    title: raw.title ?? raw.question ?? '',
    yesPrice: parsePrice(prices[0]),
    noPrice: parsePrice(prices[1]),
    volume: raw.volume ?? 0,
    platform: 'limitless',
    lastUpdated: Date.now(),
  };
}

export function parseActiveLimitlessMarkets(data: LimitlessMarketsResponse): LimitlessMarket[] {
  const raw = data.markets ?? data.data ?? [];
  return raw
    .filter((m) => m.active !== false && !m.closed)
    .map(normalize)
    .filter((m): m is LimitlessMarket => m !== null);
}
