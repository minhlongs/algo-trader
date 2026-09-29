/**
 * Tier 2 BVA Tests: Extreme Tick Latencies & Feed Watchdog Dead-Man Switch
 */

import { describe, it, expect, vi } from 'vitest';
import { FeedFreshnessWatchdog } from '../../../../src/desk/feeds/feed-freshness-watchdog';

export function registerTier2LatencyWatchdogTests(): void {
  describe('Tier 2: Extreme Tick Latencies & Watchdog Dead-Man Switch', () => {
    it('exact 4,999ms tick latency does not trip dead-man switch', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      const now = 1_000_000;
      watchdog.recordTick('binance', 'BTC/USDT', now - 4999);
      const res = watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(false);
      expect(res.isHealthy).toBe(false); // 4999 > 2000 warning threshold -> DEGRADED
      expect(watchdog.getState()).toBe('DEGRADED');
    });

    it('exact 5,000ms tick latency does not trip dead-man switch', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      const now = 1_000_000;
      watchdog.recordTick('binance', 'BTC/USDT', now - 5000);
      watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(false);
    });

    it('exact 5,001ms tick latency trips dead-man switch into TRIPPED state', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      const now = 1_000_000;
      watchdog.recordTick('binance', 'BTC/USDT', now - 5001);
      const res = watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(true);
      expect(watchdog.getState()).toBe('TRIPPED');
      expect(res.staleFeeds).toHaveLength(1);
      expect(res.staleFeeds[0]?.venueId).toBe('binance');
      expect(res.staleFeeds[0]?.elapsedMs).toBe(5001);
    });

    it('exact 0ms tick latency maintains HEALTHY state', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      const now = 1_000_000;
      watchdog.recordTick('binance', 'BTC/USDT', now);
      const res = watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(false);
      expect(watchdog.getState()).toBe('HEALTHY');
      expect(res.isHealthy).toBe(true);
    });

    it('handles future tick timestamps (clock skew) safely as 0ms lag', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      const now = 1_000_000;
      watchdog.recordTick('binance', 'BTC/USDT', now + 500); // 500ms into future
      const lag = watchdog.getVenueLag('binance', 'BTC/USDT', now);
      expect(lag).toBe(0);
      const res = watchdog.checkFreshness(now);
      expect(res.isHealthy).toBe(true);
      expect(watchdog.isTripped()).toBe(false);
    });

    it('tick latency at 1,999ms remains HEALTHY below warning threshold', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000, warningThresholdMs: 2000 });
      const now = 1_000_000;
      watchdog.recordTick('bybit', 'ETH/USDT', now - 1999);
      const res = watchdog.checkFreshness(now);
      expect(res.state).toBe('HEALTHY');
      expect(res.isHealthy).toBe(true);
    });

    it('tick latency at 2,001ms degrades state without tripping emergency halt', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000, warningThresholdMs: 2000 });
      const now = 1_000_000;
      watchdog.recordTick('bybit', 'ETH/USDT', now - 2001);
      const res = watchdog.checkFreshness(now);
      expect(res.state).toBe('DEGRADED');
      expect(watchdog.isTripped()).toBe(false);
    });

    it('isolates stale venue B (5,001ms) while venue A is fresh (4,999ms)', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      const now = 1_000_000;
      watchdog.recordTick('binance', 'BTC/USDT', now - 4999);
      watchdog.recordTick('bybit', 'BTC/USDT', now - 5001);
      const res = watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(true);
      expect(res.staleFeeds).toHaveLength(1);
      expect(res.staleFeeds[0]?.venueId).toBe('bybit');
    });

    it('heartbeat latency at 4,999ms does not trip', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      const now = 1_000_000;
      watchdog.recordHeartbeat('polymarket', now - 4999);
      watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(false);
    });

    it('heartbeat latency at 5,001ms trips dead-man switch', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      const now = 1_000_000;
      watchdog.recordHeartbeat('polymarket', now - 5001);
      const res = watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(true);
      expect(res.staleFeeds.some((f) => f.venueId === 'polymarket')).toBe(true);
    });

    it('heartbeat timeout event triggers immediate emergency halt trip', () => {
      const onTrip = vi.fn();
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000, onTrip });
      watchdog.recordHeartbeatTimeout('binance', new Error('WS socket hang up'));
      expect(watchdog.isTripped()).toBe(true);
      expect(watchdog.getState()).toBe('TRIPPED');
      expect(onTrip).toHaveBeenCalledTimes(1);
    });

    it('checkFreshness without any recorded ticks returns healthy without throwing', () => {
      const watchdog = new FeedFreshnessWatchdog();
      const res = watchdog.checkFreshness();
      expect(res.isHealthy).toBe(true);
      expect(res.staleFeeds).toEqual([]);
    });

    it('handles 100 rapid ticks within 10ms keeping state HEALTHY', () => {
      const watchdog = new FeedFreshnessWatchdog();
      const t0 = 1_000_000;
      for (let i = 0; i < 100; i++) {
        watchdog.recordTick('binance', 'BTC/USDT', t0 + i * 0.1);
      }
      const res = watchdog.checkFreshness(t0 + 10);
      expect(res.isHealthy).toBe(true);
      expect(watchdog.isTripped()).toBe(false);
    });

    it('resetting watchdog clears tripped flag and restores HEALTHY status', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
      watchdog.recordTick('binance', 'BTC/USDT', 1000);
      watchdog.checkFreshness(10000); // 9000ms elapsed -> trips
      expect(watchdog.isTripped()).toBe(true);
      watchdog.reset();
      expect(watchdog.isTripped()).toBe(false);
      expect(watchdog.getState()).toBe('HEALTHY');
    });

    it('custom threshold (100ms) trips at 101ms and not at 99ms', () => {
      const watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 100 });
      const now = 10_000;
      watchdog.recordTick('okx', 'SOL/USDT', now - 99);
      watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(false);

      watchdog.recordTick('okx', 'SOL/USDT', now - 101);
      watchdog.checkFreshness(now);
      expect(watchdog.isTripped()).toBe(true);
    });
  });
}
