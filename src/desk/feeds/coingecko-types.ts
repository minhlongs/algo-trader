/**
 * CoinGecko Price Feed Types
 */

// ---------------------------------------------------------------------------
// Public Types (used by consumers)
// ---------------------------------------------------------------------------

export interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  totalVolume: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  lastUpdated: number;
  vsCurrency: string;
}

export interface CoinGeckoFeed {
  markets: CoinGeckoMarket[];
  fetchedAt: number;
}

export interface HistoricalDataPoint {
  timestamp: number;
  price: number;
}

export interface CoinGeckoHistoricalData {
  id: string;
  currency: string;
  timestamps: number[];
  prices: number[];
}

// ---------------------------------------------------------------------------
// Private Response Types (API responses)
// ---------------------------------------------------------------------------

export interface CoinGeckoMarketResponse {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  last_updated: string | null;
}

export interface CoinGeckoMarketsResponse {
  markets: CoinGeckoMarketResponse[];
}

export interface CoinGeckoHistoricalResponse {
  prices: [number, number][];
  market_caps?: [number, number][];
  total_volumes?: [number, number][];
}
