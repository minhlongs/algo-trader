/**
 * Chaos: Provider Outage
 * Simulates 503 from exchange data providers, verifies failover + circuit breaker + recovery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FailoverManager } from '../../src/desk/market-data/provider-failover';
import { MarketDataSource } from '../../src/desk/market-data/types';

describe('Chaos: Provider Outage', () => {
  let manager: FailoverManager;

  beforeEach(() => {
    // Binance primary → CoinGecko secondary (both are exchange sources)
    manager = new FailoverManager({
      primary: MarketDataSource.BINANCE,
      secondary: MarketDataSource.COINGECKO,
      failureThreshold: 3,
      failbackCooldownMs: 5 * 60 * 1000,
      enableAutoFailback: true,
    });
  });

  it('triggers failover after threshold consecutive 503s', () => {
    // Simulate 3 consecutive provider failures (503s)
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(false, 0);

    expect(manager.getActiveProvider()).toBe(MarketDataSource.COINGECKO);
  });

  it('keeps primary healthy for failures below threshold', () => {
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(false, 0);

    // 2 failures < threshold=3 → no failover
    expect(manager.getActiveProvider()).toBe(MarketDataSource.BINANCE);
  });

  it('records failover event in history', () => {
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(false, 0);

    const history = manager.getFailoverHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].fromProvider).toBe(MarketDataSource.BINANCE);
    expect(history[0].toProvider).toBe(MarketDataSource.COINGECKO);
  });

  it('recovers via failback when primary restored', async () => {
    // First: trigger failover
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(false, 0);
    expect(manager.getActiveProvider()).toBe(MarketDataSource.COINGECKO);

    // Simulate primary coming back → record successes on the failover track
    manager.recordRequestResult(true, 0);
    manager.recordRequestResult(true, 0);

    // Force failback (bypass cooldown for deterministic test)
    const ok = await manager.forceFailback('Recovered from 503');
    expect(ok).toBe(true);
    expect(manager.getActiveProvider()).toBe(MarketDataSource.BINANCE);
  });

  it('reset clears failure count after success', () => {
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(false, 0);
    manager.recordRequestResult(true, 0);

    // After success, consecutive failures should reset → next failure starts fresh
    manager.recordRequestResult(false, 0);
    expect(manager.getActiveProvider()).toBe(MarketDataSource.BINANCE);
  });
});