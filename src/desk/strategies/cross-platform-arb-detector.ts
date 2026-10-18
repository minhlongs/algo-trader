/**
 * Cross-Platform Arbitrage Detector — Core Implementation
 *
 * Compares prices across Polymarket, Kalshi, and CEX platforms
 * to detect arbitrage opportunities.
 *
 * Extracted from cross-platform-arb.ts to keep files under 200 lines.
 * Re-exported via cross-platform-arb.ts facade.
 */

import { logger } from '../../shared/utils/logger';
import { PolymarketWebSocketFeed, PriceUpdate as PmPriceUpdate } from '../feeds/polymarket-websocket-feed';
import { startKalshiPolling, KalshiMarket } from '../feeds/kalshi-price-feed';
import { FeedAggregator, FeedMessage, UnifiedTicker } from '../feeds/feed-aggregator';
import type { PlatformPrice, ArbOpportunity, ArbConfig } from './cross-platform-arb-types';
import {
  computeArbConfidence,
  evaluateAssetArb,
  upsertPlatformPrice,
} from './cross-platform-arb-math';

export { computeArbConfidence, evaluateAssetArb, upsertPlatformPrice };

export class CrossPlatformArbDetector {
  private config: ArbConfig;
  private prices: Map<string, PlatformPrice[]> = new Map();
  private pmFeed: PolymarketWebSocketFeed | null = null;
  private kalshiStop: (() => void) | null = null;
  private aggregator: FeedAggregator | null = null;
  private running = false;
  private handlers: Array<(opp: ArbOpportunity) => void> = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<ArbConfig>) {
    this.config = { minSpreadPercent: 0.5, maxAssets: 20, pollIntervalMs: 30_000, ...config };
  }

  async start(): Promise<void> {
    this.running = true;

    try {
      this.pmFeed = new PolymarketWebSocketFeed();
      this.pmFeed.onPriceUpdate((update: PmPriceUpdate) => { this._ingestPmPrice(update); });
      this.pmFeed.connect();
      logger.info('[CrossPlatformArb] Polymarket WS connected');
    } catch (err) {
      logger.warn('[CrossPlatformArb] Polymarket feed unavailable', { err: String(err) });
    }

    try {
      const result = startKalshiPolling(this.config.pollIntervalMs);
      this.kalshiStop = result.stop;
      await result.stop();
      this.kalshiStop = startKalshiPolling(this.config.pollIntervalMs).stop;
      logger.info('[CrossPlatformArb] Kalshi polling started');
    } catch (err) {
      logger.warn('[CrossPlatformArb] Kalshi feed unavailable', { err: String(err) });
    }

    try {
      this.aggregator = new FeedAggregator();
      await this.aggregator.connect();
      this.aggregator.onFeed((msg: FeedMessage) => {
        if (msg.type === 'ticker') { this._ingestCexTicker(msg.data); }
      });
      logger.info('[CrossPlatformArb] CEX aggregator connected');
    } catch (err) {
      logger.warn('[CrossPlatformArb] CEX aggregator unavailable', { err: String(err) });
    }

    this.pollTimer = setInterval(() => { this.detectArb(); }, this.config.pollIntervalMs);
    logger.info('[CrossPlatformArb] Started', { minSpread: this.config.minSpreadPercent, pollMs: this.config.pollIntervalMs });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.pmFeed) { this.pmFeed.close(); this.pmFeed = null; }
    if (this.kalshiStop) { this.kalshiStop(); this.kalshiStop = null; }
    if (this.aggregator) { await this.aggregator.disconnect(); this.aggregator = null; }
    this.prices.clear();
    logger.info('[CrossPlatformArb] Stopped');
  }

  comparePrices(asset: string, platforms: string[]): PlatformPrice[] {
    const all = this.prices.get(asset) ?? [];
    return platforms.length === 0 ? all : all.filter((p) => platforms.includes(p.platform));
  }

  detectArb(): ArbOpportunity[] {
    if (!this.running) return [];
    const opportunities: ArbOpportunity[] = [];
    const now = Date.now();

    for (const [asset, priceList] of this.prices.entries()) {
      const opp = evaluateAssetArb(asset, priceList, this.config.minSpreadPercent, now);
      if (opp) {
        opportunities.push(opp);
        this._notifyHandlers(opp);
      }
    }

    if (opportunities.length > 0) {
      logger.info('[CrossPlatformArb] Opportunities found', { count: opportunities.length, assets: opportunities.map((o) => o.asset) });
    }
    return opportunities;
  }

  onOpportunity(handler: (opp: ArbOpportunity) => void): void { this.handlers.push(handler); }
  getPriceSnapshot(): Map<string, PlatformPrice[]> { return new Map(this.prices); }

  private _ingestPmPrice(update: PmPriceUpdate): void {
    this._upsertPrice(update.tokenId, { platform: 'polymarket', asset: update.tokenId, bid: update.bestBid, ask: update.bestAsk, last: update.lastTradePrice, timestamp: update.timestamp });
  }

  private _ingestKalshiMarket(market: KalshiMarket): void {
    this._upsertPrice(market.ticker, { platform: 'kalshi', asset: market.ticker, bid: market.yesPrice, ask: market.yesPrice + 0.01, last: market.yesPrice, timestamp: market.lastUpdated });
  }

  private _ingestCexTicker(ticker: UnifiedTicker): void {
    this._upsertPrice(ticker.symbol, { platform: ticker.exchange, asset: ticker.symbol, bid: ticker.bid, ask: ticker.ask, last: ticker.last, timestamp: ticker.timestamp });
  }

  private _upsertPrice(asset: string, price: PlatformPrice): void {
    upsertPlatformPrice(this.prices, asset, price, this.config.maxAssets);
  }

  private _confidence(priceList: PlatformPrice[], spreadPercent: number): 'high' | 'medium' | 'low' {
    return computeArbConfidence(priceList, spreadPercent);
  }

  private _notifyHandlers(opp: ArbOpportunity): void {
    for (const handler of this.handlers) {
      try { handler(opp); } catch (err) { logger.warn('[CrossPlatformArb] Handler error', { err: String(err) }); }
    }
  }
}

let arbInstance: CrossPlatformArbDetector | null = null;

export function getCrossPlatformArbDetector(config?: Partial<ArbConfig>): CrossPlatformArbDetector {
  if (!arbInstance) { arbInstance = new CrossPlatformArbDetector(config); }
  return arbInstance;
}
