/**
 * CoinGecko Price Feed — REST API polling with NATS integration
 *
 * This module provides the polling service that periodically fetches market data
 * and publishes updates to the NATS message bus.
 *
 * For direct API access, use functions from 'coingecko-client.ts'.
 */

export { startCoinGeckoPolling, getCoinGeckoNatsTopic } from './coingecko-client';
export type {
  CoinGeckoMarket,
  CoinGeckoFeed,
  CoinGeckoHistoricalData,
  HistoricalDataPoint,
} from './coingecko-types';
export {
  fetchCoinGeckoMarkets,
  fetchCoinGeckoSimplePrices,
  fetchCoinGeckoHistoricalData,
  getLatestCoinGeckoPrices,
  getCoinFromCache,
  clearCoinGeckoCache,
} from './coingecko-client';
