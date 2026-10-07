import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FailoverManager,
  MarketDataSource,
  ProviderHealthStatus,
  CircuitState,
} from '../../../../src/desk/market-data/provider-failover';
import {
  calculateHealthStatus,
  updateProviderStatus,
  switchActiveProvider,
  checkHalfOpenTransition,
} from '../../../../src/desk/market-data/provider-failover-health';
import type { ProviderHealthSnapshot } from '../../../../src/desk/market-data/provider-failover-types';

describe('FailoverManager branch coverage', () => {
  let manager: FailoverManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new FailoverManager({
      primary: MarketDataSource.BINANCE,
      secondary: MarketDataSource.KUCOIN,
      failureThreshold: 2,
      failbackCooldownMs: 1000,
      healthCheckIntervalMs: 500,
    });
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  it('initializes with primary provider active', () => {
    expect(manager.getActiveProvider()).toBe(MarketDataSource.BINANCE);
    expect(manager.getFailoverHistory()).toEqual([]);
  });

  it('records request results and transitions circuit state on consecutive failures', () => {
    manager.recordRequestResult(true, 50);
    expect(manager.getActiveProvider()).toBe(MarketDataSource.BINANCE);

    // First failure
    manager.recordRequestResult(false, 100);
    expect(manager.getActiveProvider()).toBe(MarketDataSource.BINANCE);

    // Second failure triggers failover
    manager.recordRequestResult(false, 150);
    expect(manager.getActiveProvider()).toBe(MarketDataSource.KUCOIN);

    const history = manager.getFailoverHistory();
    expect(history.length).toBe(1);
    expect(history[0].triggeredBy).toBe('automatic');
    expect(history[0].fromProvider).toBe(MarketDataSource.BINANCE);
    expect(history[0].toProvider).toBe(MarketDataSource.KUCOIN);
  });

  it('handles manual forceFailover and prevent duplicate failover', async () => {
    const success = await manager.forceFailover('operator trigger');
    expect(success).toBe(true);
    expect(manager.getActiveProvider()).toBe(MarketDataSource.KUCOIN);

    // Duplicate failover should return false
    const duplicate = await manager.forceFailover('again');
    expect(duplicate).toBe(false);
  });

  it('handles manual forceFailback and prevents failback when secondary unhealthy or primary already active', async () => {
    // When primary is already active, forceFailback returns false
    const failbackWhilePrimary = await manager.forceFailback('test');
    expect(failbackWhilePrimary).toBe(false);

    // Failover first
    await manager.forceFailover('manual');
    expect(manager.getActiveProvider()).toBe(MarketDataSource.KUCOIN);

    // Now failback
    const failbackSuccess = await manager.forceFailback('recovery');
    expect(failbackSuccess).toBe(true);
    expect(manager.getActiveProvider()).toBe(MarketDataSource.POLYMARKET_CLOB ? MarketDataSource.BINANCE : MarketDataSource.BINANCE);
  });

  it('blocks failback if secondary provider is marked unhealthy', async () => {
    await manager.forceFailover('manual');
    const snapshots = manager.getAllHealthSnapshots();
    const secondarySnap = snapshots.find((s) => s.provider === MarketDataSource.KUCOIN);
    if (secondarySnap) {
      secondarySnap.status = ProviderHealthStatus.UNHEALTHY;
    }

    const res = await manager.forceFailback('test');
    expect(res).toBe(false);
  });

  it('advances health check timer and evaluates half open transitions', async () => {
    await manager.forceFailover('manual');
    expect(manager.getActiveProvider()).toBe(MarketDataSource.KUCOIN);

    // Advance time past cooldown
    vi.advanceTimersByTime(1500);

    const snapshots = manager.getAllHealthSnapshots();
    expect(snapshots.length).toBe(2);
  });

  it('tests health helper branch functions directly', () => {
    const snap: ProviderHealthSnapshot = {
      provider: MarketDataSource.BINANCE,
      status: ProviderHealthStatus.HEALTHY,
      consecutiveFailures: 1,
      isActive: true,
      isPrimary: true,
      lastSuccess: 0,
      lastFailure: 0,
      avgLatency: 0,
      requestCount: 0,
    };

    expect(calculateHealthStatus(snap, 3)).toBe(ProviderHealthStatus.DEGRADED);
    snap.consecutiveFailures = 3;
    expect(calculateHealthStatus(snap, 3)).toBe(ProviderHealthStatus.UNHEALTHY);
    snap.consecutiveFailures = 0;
    expect(calculateHealthStatus(snap, 3)).toBe(ProviderHealthStatus.HEALTHY);

    const map = new Map<MarketDataSource, ProviderHealthSnapshot>();
    map.set(MarketDataSource.BINANCE, snap);
    updateProviderStatus(map, MarketDataSource.BINANCE, ProviderHealthStatus.DEGRADED);
    expect(snap.status).toBe(ProviderHealthStatus.DEGRADED);

    // Non-existent provider update is a no-op
    updateProviderStatus(map, MarketDataSource.COINGECKO, ProviderHealthStatus.UNHEALTHY);

    // Switch active
    expect(switchActiveProvider(map, MarketDataSource.COINGECKO)).toBe(false);

    // checkHalfOpenTransition when closed
    expect(checkHalfOpenTransition(CircuitState.CLOSED, Date.now(), 1000).shouldTransition).toBe(false);
    // checkHalfOpenTransition when open but not cooled down
    expect(checkHalfOpenTransition(CircuitState.OPEN, Date.now(), 10000).shouldTransition).toBe(false);
    // checkHalfOpenTransition when cooled down
    const cooled = checkHalfOpenTransition(CircuitState.OPEN, Date.now() - 2000, 1000, snap);
    expect(cooled.shouldTransition).toBe(true);
    expect(snap.isActive).toBe(true);
  });
});
