/**
 * Gamma Markets API Client — type definitions for strategy consumption.
 */
export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: number;
  /** 24-hour trading volume — may be absent for older markets */
  volume24h?: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  closed: boolean;
  /** True when the market has been resolved */
  resolved?: boolean;
  groupItemTitle?: string;
  tokens: Array<{ token_id: string; outcome: string; price: number }>;
  /** Token ID for the YES outcome. */
  yesTokenId: string;
  /** Token ID for the NO outcome — absent on single-outcome markets */
  noTokenId?: string;
  /** Current mid-price of the YES outcome (0–1) */
  yesPrice: number;
}

export interface GammaMarketGroup {
  id: string;
  title: string;
  slug: string;
  markets: GammaMarket[];
}

export interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  markets: GammaMarket[];
}

export interface GammaClient {
  getMarkets(params?: { limit?: number; active?: boolean }): Promise<GammaMarket[]>;
  getMarket(conditionId: string): Promise<GammaMarket | null>;
  getMarketGroup(groupId: string): Promise<GammaMarketGroup | null>;
  searchMarkets(query: string): Promise<GammaMarket[]>;
  /** Fetch trending markets sorted by recent volume */
  getTrending(limit?: number): Promise<GammaMarket[]>;
  /** Fetch active events (groups of related markets) */
  getEvents(limit?: number): Promise<GammaEvent[]>;
}
