/**
 * Cross-Platform Arbitrage Detector
 *
 * Compares prices across Polymarket, Kalshi, and CEX platforms
 * to detect arbitrage opportunities.
 *
 * Uses existing price feed infrastructure:
 * - Polymarket WS (onPriceUpdate handler)
 * - Kalshi HTTP polling (startKalshiPolling)
 * - CEX FeedAggregator (onFeed handler, UnifiedTicker messages)
 *
 * Phase 24 — Cross-Platform Arbitrage
 */

import { logger } from '../../shared/utils/logger';
import { PolymarketWebSocketFeed, PriceUpdate as PmPriceUpdate } from '../feeds/polymarket-websocket-feed';
import { startKalshiPolling, KalshiMarket } from '../feeds/kalshi-price-feed';
import { FeedAggregator, FeedMessage, UnifiedTicker } from '../feeds/feed-aggregator';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlatformPrice {
  platform: 'polymarket' | 'kalshi' | 'binance' | 'okx' | 'bybit';
  asset: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

export interface ArbOpportunity {
  asset: string;
  buyPlatform: string;
  sellPlatform: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  estimatedProfit: number;
  confidence: 'high' | 'medium' | 'low';
  timestamp: number;
}

export interface ArbConfig {
  minSpreadPercent: number;
  maxAssets: number;
  pollIntervalMs: number;
}

// ─── Detector ────────────────────────────────────────────────────────────────

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

  /** Start monitoring — connects to feeds and begins polling */
  async start(): Promise<void> {
    this.running = true;

    // Connect Polymarket WS feed
    try {
      this.pmFeed = new PolymarketWebSocketFeed();
      this.pmFeed.onPriceUpdate((update: PmPriceUpdate) => {
        this._ingestPmPrice(update);
      });
      this.pmFeed.connect();
      logger.info('[CrossPlatformArb] Polymarket WS connected');
    } catch (err) {
      logger.warn('[CrossPlatformArb] Polymarket feed unavailable', { err: String(err) });
    }

    // Connect Kalshi HTTP polling
    try {
      const result = startKalshiPolling(this.config.pollIntervalMs);
      this.kalshiStop = result.stop;
      // Poll once immediately for initial data
      await result.stop();
      // restartKalshiPolling returns stop; we keep it running
      this.kalshiStop = startKalshiPolling(this.config.pollIntervalMs).stop;
      logger.info('[CrossPlatformArb] Kalshi polling started');
    } catch (err) {
      logger.warn('[CrossPlatformArb] Kalshi feed unavailable', { err: String(err) });
    }

    // Connect CEX aggregator
    try {
      this.aggregator = new FeedAggregator();
      await this.aggregator.connect();
      this.aggregator.onFeed((msg: FeedMessage) => {
        if (msg.type === 'ticker') {
          this._ingestCexTicker(msg.data);
        }
      });
      logger.info('[CrossPlatformArb] CEX aggregator connected');
    } catch (err) {
      logger.warn('[CrossPlatformArb] CEX aggregator unavailable', { err: String(err) });
    }

    // Periodic detection sweep
    this.pollTimer = setInterval(() => {
      this.detectArb();
    }, this.config.pollIntervalMs);

    logger.info('[CrossPlatformArb] Started', {
      minSpread: this.config.minSpreadPercent,
      pollMs: this.config.pollIntervalMs,
    });
  }

  /** Stop monitoring and disconnect feeds */
  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.pmFeed) {
      this.pmFeed.close();
      this.pmFeed = null;
    }
    if (this.kalshiStop) {
      this.kalshiStop();
      this.kalshiStop = null;
    }
    if (this.aggregator) {
      await this.aggregator.disconnect();
      this.aggregator = null;
    }
    this.prices.clear();
    logger.info('[CrossPlatformArb] Stopped');
  }

  /** Compare prices across platforms for a specific asset */
  comparePrices(asset: string, platforms: string[]): PlatformPrice[] {
    const all = this.prices.get(asset) ?? [];
    if (platforms.length === 0) return all;
    return all.filter((p) => platforms.includes(p.platform));
  }

  /** Detect arbitrage opportunities across all tracked assets */
  detectArb(): ArbOpportunity[] {
    if (!this.running) return [];
    const opportunities: ArbOpportunity[] = [];
    const now = Date.now();

    for (const [asset, priceList] of this.prices.entries()) {
      if (priceList.length < 2) continue;

      // Find best bid (highest) and best ask (lowest) across platforms
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
          asset,
          buyPlatform: bestAsk.platform,
          sellPlatform: bestBid.platform,
          buyPrice: bestAsk.ask,
          sellPrice: bestBid.bid,
          spread,
          spreadPercent,
          estimatedProfit: spread,
          confidence: this._confidence(priceList, spreadPercent),
          timestamp: now,
        };
        opportunities.push(opp);
        this._notifyHandlers(opp);
      }
    }

    if (opportunities.length > 0) {
      logger.info('[CrossPlatformArb] Opportunities found', {
        count: opportunities.length,
        assets: opportunities.map((o) => o.asset),
      });
    }

    return opportunities;
  }

  /** Register a callback for new arbitrage opportunities */
  onOpportunity(handler: (opp: ArbOpportunity) => void): void {
    this.handlers.push(handler);
  }

  /** Get current price snapshot for all tracked assets */
  getPriceSnapshot(): Map<string, PlatformPrice[]> {
    return new Map(this.prices);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _ingestPmPrice(update: PmPriceUpdate): void {
    const price: PlatformPrice = {
      platform: 'polymarket',
      asset: update.tokenId,
      bid: update.bestBid,
      ask: update.bestAsk,
      last: update.lastTradePrice,
      timestamp: update.timestamp,
    };
    this._upsertPrice(update.tokenId, price);
  }

  private _ingestKalshiMarket(market: KalshiMarket): void {
    const price: PlatformPrice = {
      platform: 'kalshi',
      asset: market.ticker,
      bid: market.yesPrice,
      ask: market.yesPrice + 0.01,
      last: market.yesPrice,
      timestamp: market.lastUpdated,
    };
    this._upsertPrice(market.ticker, price);
  }

  private _ingestCexTicker(ticker: UnifiedTicker): void {
    const price: PlatformPrice = {
      platform: ticker.exchange,
      asset: ticker.symbol,
      bid: ticker.bid,
      ask: ticker.ask,
      last: ticker.last,
      timestamp: ticker.timestamp,
    };
    this._upsertPrice(ticker.symbol, price);
  }

  private _upsertPrice(asset: string, price: PlatformPrice): void {
    const existing = this.prices.get(asset) ?? [];
    const idx = existing.findIndex((p) => p.platform === price.platform);
    if (idx >= 0) {
      existing[idx] = price;
    } else {
      existing.push(price);
    }
    // Cap tracked assets
    if (this.prices.size >= this.config.maxAssets && !this.prices.has(asset)) {
      const firstKey = this.prices.keys().next().value;
      if (firstKey) this.prices.delete(firstKey);
    }
    this.prices.set(asset, existing);
  }

  private _confidence(priceList: PlatformPrice[], spreadPercent: number): 'high' | 'medium' | 'low' {
    const freshness = priceList.every(
      (p) => Date.now() - p.timestamp < 10_000,
    );
    if (freshness && spreadPercent > 2) return 'high';
    if (freshness && spreadPercent > 1) return 'medium';
    return 'low';
  }

  private _notifyHandlers(opp: ArbOpportunity): void {
    for (const handler of this.handlers) {
      try {
        handler(opp);
      } catch (err) {
        logger.warn('[CrossPlatformArb] Handler error', { err: String(err) });
      }
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let arbInstance: CrossPlatformArbDetector | null = null;

export function getCrossPlatformArbDetector(config?: Partial<ArbConfig>): CrossPlatformArbDetector {
  if (!arbInstance) {
    arbInstance = new CrossPlatformArbDetector(config);
  }
  return arbInstance;
}
