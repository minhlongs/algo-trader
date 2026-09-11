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

export class CrossPlatformArbDetector {
  private config: ArbConfig;
  private prices: Map<string, PlatformPrice[]> = new Map();
  private pmFeed: PolymarketWebSocketFeed | null = null;
  private kalshiStop: (() => void) | null = null;
  private aggregator: FeedAggregator | null = null;
  private running: boolean = false;
  private handlers: Array<(opp: ArbOpportunity) => void> = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<ArbConfig>) {
    this.config = {
      minSpreadPercent: 0.5,
      maxAssets: 20,
      pollIntervalMs: 30_000,
      ...config,
    };
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
    if (platforms.length === 0) return all;
    return all.filter((p) => platforms.includes(p.platform));
  }

  detectArb(): ArbOpportunity[] {
    if (!this.running) return [];
    const opportunities: ArbOpportunity[] = [];
    const now = Date.now();

    for (const [asset, priceList] of this.prices.entries()) {
      if (priceList.length < 2) continue;
      const sortedByAsk = [...priceList].sort((a, b) => a.ask - b.ask);
      const sortedByBid = [...priceList].sort((a, b) => b.bid - a.bid);
      const bestAsk = sortedByAsk[0];
      const bestBid = sortedByBid[0];
      if (!bestAsk || !bestBid) continue;
      if (bestAsk.platform === bestBid.platform) continue;

      const spread = bestBid.bid - bestAsk.ask;
      const spreadPercent = (spread / bestAsk.ask) * 100;

      if (spreadPercent >= this.config.minSpreadPercent) {
        const opp: ArbOpportunity = {
          asset, buyPlatform: bestAsk.platform, sellPlatform: bestBid.platform,
          buyPrice: bestAsk.ask, sellPrice: bestBid.bid, spread, spreadPercent,
          estimatedProfit: spread, confidence: this._confidence(priceList, spreadPercent), timestamp: now,
        };
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
    const existing = this.prices.get(asset) ?? [];
    const idx = existing.findIndex((p) => p.platform === price.platform);
    if (idx >= 0) { existing[idx] = price; } else { existing.push(price); }
    if (this.prices.size >= this.config.maxAssets && !this.prices.has(asset)) {
      const firstKey = this.prices.keys().next().value;
      if (firstKey) this.prices.delete(firstKey);
    }
    this.prices.set(asset, existing);
  }

  private _confidence(priceList: PlatformPrice[], spreadPercent: number): 'high' | 'medium' | 'low' {
    const freshness = priceList.every((p) => Date.now() - p.timestamp < 10_000);
    if (freshness && spreadPercent > 2) return 'high';
    if (freshness && spreadPercent > 1) return 'medium';
    return 'low';
  }

  private _notifyHandlers(opp: ArbOpportunity): void {
    for (const handler of this.handlers) {
      try { handler(opp); } catch (err) { logger.warn('[CrossPlatformArb] Handler error', { err: String(err) }); }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let arbInstance: CrossPlatformArbDetector | null = null;

export function getCrossPlatformArbDetector(config?: Partial<ArbConfig>): CrossPlatformArbDetector {
  if (!arbInstance) { arbInstance = new CrossPlatformArbDetector(config); }
  return arbInstance;
}
