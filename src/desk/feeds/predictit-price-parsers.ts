/**
 * PredictIt Price Feed — Pure Contract Parsing & Normalization Helpers
 */

export interface PredictItMarket {
  id: string;
  title: string;
  yesPrice: number; // normalized 0–1
  noPrice: number;  // normalized 0–1
  volume: number;
  platform: 'predictit';
  lastUpdated: number;
}

export interface PredictItFeed {
  markets: PredictItMarket[];
  fetchedAt: number;
}

export interface PredictItRawContract {
  id?: number;
  name?: string;
  shortName?: string;
  lastTradePrice?: number | null; // cents 0–99
  bestBuyYesCost?: number | null; // cents 0–99
  bestBuyNoCost?: number | null;  // cents 0–99
  bestSellYesCost?: number | null;
  bestSellNoCost?: number | null;
  status?: string;
}

export interface PredictItRawMarket {
  id?: number;
  name?: string;
  shortName?: string;
  status?: string;
  contracts?: PredictItRawContract[];
}

export interface PredictItApiResponse {
  markets?: PredictItRawMarket[];
}

/** Convert PredictIt cents (0–99) to probability (0.00–0.99). */
export function centsToProb(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || isNaN(cents)) return 0;
  return Math.min(0.99, Math.max(0, cents));
}

/**
 * Normalize a PredictIt market. Binary (2-contract) markets map to yes/no.
 * Multi-contract markets are flattened: each contract becomes its own entry
 * keyed as `{marketId}-{contractId}`.
 */
export function normalizeMarket(raw: PredictItRawMarket): PredictItMarket[] {
  const contracts = raw.contracts ?? [];
  const active = contracts.filter((c) => c.status !== 'Closed');
  if (active.length === 0) return [];

  return active.map((c): PredictItMarket => {
    const yesPrice = centsToProb(c.bestBuyYesCost ?? c.lastTradePrice);
    const noPrice = centsToProb(c.bestBuyNoCost ?? (yesPrice > 0 ? 1 - yesPrice : 0));
    return {
      id: `${raw.id ?? 0}-${c.id ?? 0}`,
      title: raw.name ? `${raw.name} — ${c.shortName ?? c.name ?? ''}` : (c.name ?? ''),
      yesPrice,
      noPrice,
      volume: 0,
      platform: 'predictit',
      lastUpdated: Date.now(),
    };
  });
}

export function parsePredictItApiResponse(data: PredictItApiResponse): PredictItMarket[] {
  return (data.markets ?? [])
    .filter((m) => m.status !== 'Closed')
    .flatMap(normalizeMarket);
}
