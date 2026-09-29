/**
 * Tier 1 Tests: F3 (Market Data Multiplexer) & F4 (Feed Freshness Watchdog)
 */

import { describe, it, expect } from 'vitest';
import { MockMarketDataFeed } from './mock-desk-components';
import { FeedFreshnessWatchdog } from './daemon-test-harness';

export function registerTier1F3F4FeedsTests(): void {
  describe('F3: Market Data Multiplexer & Mid Prices', () => {
    it('ingests top-of-book prices across multiple venues concurrently', () => {
      const feed = new MockMarketDataFeed();
      feed.setTick('binance', 'BTC/USDT', 65000, 65002);
      feed.setTick('bybit', 'BTC/USDT', 64998, 65001);
      feed.setTick('polymarket_clob', 'BTC/USDT', 65001, 65003);

      expect(feed.getTick('binance', 'BTC/USDT')?.bid).toBe(65000);
      expect(feed.getTick('bybit', 'BTC/USDT')?.ask).toBe(65001);
      expect(feed.getTick('polymarket_clob', 'BTC/USDT')?.bid).toBe(65001);
    });

    it('calculates exact arithmetic mid-price for valid spreads', () => {
      const feed = new MockMarketDataFeed();
      feed.setTick('binance', 'ETH/USDT', 3500.0, 3502.0);
      const mid = feed.getMidPrice('binance', 'ETH/USDT');
      expect(mid).toBe(3501.0);
    });

    it('calculates volume-weighted micro-price from order book depth', () => {
      const feed = new MockMarketDataFeed();
      // Bid 100 with vol 10, Ask 102 with vol 30 -> mid tilted towards ask: (100*30 + 102*10)/40 = (3000 + 1020)/40 = 100.5
      feed.setDepth('binance', 'SOL/USDT', [[100, 10]], [[102, 30]]);
      const weightedMid = feed.getWeightedMidPrice('binance', 'SOL/USDT');
      expect(weightedMid).toBeCloseTo(100.5, 4);
    });

    it('returns undefined for inverted book where bid exceeds ask', () => {
      const feed = new MockMarketDataFeed();
      feed.setTick('binance', 'BTC/USDT', 65010, 65000);
      expect(feed.getMidPrice('binance', 'BTC/USDT')).toBeUndefined();
    });

    it('returns undefined for non-positive bid or ask prices', () => {
      const feed = new MockMarketDataFeed();
      feed.setTick('binance', 'BTC/USDT', 0, 65000);
      expect(feed.getMidPrice('binance', 'BTC/USDT')).toBeUndefined();
      feed.setTick('binance', 'BTC/USDT', -10, 65000);
      expect(feed.getMidPrice('binance', 'BTC/USDT')).toBeUndefined();
    });

    it('handles query for unobserved venue/symbol gracefully without throwing', () => {
      const feed = new MockMarketDataFeed();
      expect(feed.getTick('coinbase', 'BTC/USDT')).toBeUndefined();
      expect(feed.getMidPrice('coinbase', 'BTC/USDT')).toBeUndefined();
    });
  });

  describe('F4: Feed Freshness Watchdog & Dead-Man Switch', () => {
    it('maintains healthy status when all venues receive fresh ticks', () => {
      const watchdog = new FeedFreshnessWatchdog(5000);
      const now = 1727500000000;
      watchdog.recordTick('binance', now - 500);
      watchdog.recordTick('bybit', now - 800);
      const status = watchdog.checkFreshness(now);
      expect(status.isStale).toBe(false);
      expect(status.worstLatencyMs).toBe(800);
      expect(status.staleVenues.length).toBe(0);
      expect(watchdog.isTripped()).toBe(false);
    });

    it('trips dead-man switch when tick age exceeds max staleness limit', () => {
      const watchdog = new FeedFreshnessWatchdog(5000);
      const now = 1727500000000;
      watchdog.recordTick('binance', now - 5001);
      const status = watchdog.checkFreshness(now);
      expect(status.isStale).toBe(true);
      expect(status.staleVenues).toContain('binance');
      expect(watchdog.isTripped()).toBe(true);
    });

    it('invokes onFeedStale callback with venue and precise latency', () => {
      let reportedVenue = '';
      let reportedLatency = 0;
      const watchdog = new FeedFreshnessWatchdog(5000, (venue, latency) => {
        reportedVenue = venue;
        reportedLatency = latency;
      });
      const now = 1727500000000;
      watchdog.recordTick('polymarket', now - 6500);
      watchdog.checkFreshness(now);
      expect(reportedVenue).toBe('polymarket');
      expect(reportedLatency).toBe(6500);
    });

    it('pinpoints exact stale venue among mixed healthy and stale feeds', () => {
      const watchdog = new FeedFreshnessWatchdog(5000);
      const now = 1727500000000;
      watchdog.recordTick('binance', now - 100);
      watchdog.recordTick('bybit', now - 7200);
      watchdog.recordTick('polymarket', now - 300);
      const status = watchdog.checkFreshness(now);
      expect(status.isStale).toBe(true);
      expect(status.staleVenues).toEqual(['bybit']);
    });

    it('latches tripped state until explicitly reset', () => {
      const watchdog = new FeedFreshnessWatchdog(5000);
      const now = 1727500000000;
      watchdog.recordTick('binance', now - 8000);
      watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(true);
      watchdog.reset();
      expect(watchdog.isTripped()).toBe(false);
    });

    it('handles zero or negative elapsed time without false-positive trip', () => {
      const watchdog = new FeedFreshnessWatchdog(5000);
      const now = 1727500000000;
      watchdog.recordTick('binance', now + 100); // Future tick (clock skew)
      const status = watchdog.checkFreshness(now);
      expect(status.isStale).toBe(false);
      expect(status.worstLatencyMs).toBe(0);
    });
  });
}
