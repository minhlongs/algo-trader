/**
 * Unit Tests for Feed Freshness Watchdog & Dead-Man Switch
 * Milestone M2: Streaming Feeds & Freshness Watchdog
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { FeedFreshnessWatchdog } from '../../../src/desk/feeds/feed-freshness-watchdog';
import type { EmergencyHaltable, WatchdogTripEvent } from '../../../src/desk/feeds/feed-freshness-watchdog-types';

describe('FeedFreshnessWatchdog', () => {
  let watchdog: FeedFreshnessWatchdog;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    watchdog?.stop();
    vi.useRealTimers();
  });

  it('initializes in HEALTHY state with clean start/stop lifecycle', () => {
    watchdog = new FeedFreshnessWatchdog();
    expect(watchdog.getState()).toBe('HEALTHY');
    expect(watchdog.isTripped()).toBe(false);

    watchdog.start();
    watchdog.stop();
    expect(watchdog.isTripped()).toBe(false);
  });

  it('keeps HEALTHY state when ticks and heartbeats arrive on time', () => {
    watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000, checkIntervalMs: 250 });
    watchdog.start();

    watchdog.recordTick('binance', 'BTC/USDT', Date.now());
    watchdog.recordHeartbeat('bybit', Date.now());

    vi.advanceTimersByTime(1000);
    const status = watchdog.checkFreshness(Date.now());
    expect(status.isHealthy).toBe(true);
    expect(status.state).toBe('HEALTHY');
    expect(status.staleFeeds).toHaveLength(0);
  });

  it('transitions to DEGRADED when feed latency exceeds warning threshold', () => {
    const now = 10000;
    watchdog = new FeedFreshnessWatchdog({
      maxStalenessMs: 5000,
      warningThresholdMs: 2000,
      checkIntervalMs: 250,
    });

    watchdog.recordTick('binance', 'BTC/USDT', now);
    const status = watchdog.checkFreshness(now + 2500);

    expect(status.isHealthy).toBe(false);
    expect(status.state).toBe('DEGRADED');
  });

  it('trips dead-man switch when tick latency exceeds maxStalenessMs (5,000ms)', () => {
    const onStale = vi.fn();
    const onTrip = vi.fn();
    const now = 20000;

    watchdog = new FeedFreshnessWatchdog({
      maxStalenessMs: 5000,
      onFeedStale: onStale,
      onTrip,
    });

    watchdog.recordTick('binance', 'BTC/USDT', now);
    const status = watchdog.checkFreshness(now + 5001);

    expect(status.isHealthy).toBe(false);
    expect(watchdog.isTripped()).toBe(true);
    expect(watchdog.getState()).toBe('TRIPPED');
    expect(onStale).toHaveBeenCalledWith('binance', 5001);
    expect(onTrip).toHaveBeenCalled();
  });

  it('immediately trips dead-man switch upon heartbeat timeout without waiting', () => {
    const onTrip = vi.fn();
    watchdog = new FeedFreshnessWatchdog({ maxStalenessMs: 5000, onTrip });

    watchdog.recordHeartbeat('polymarket_clob');
    watchdog.recordHeartbeatTimeout('polymarket_clob', new Error('WS Ping timeout'));

    expect(watchdog.isTripped()).toBe(true);
    expect(onTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: 'polymarket_clob',
        reason: expect.stringContaining('Heartbeat timeout'),
      })
    );
  });

  it('triggers fail-closed emergency halt within <= 100ms SLA', () => {
    let haltExecutionTimeMs = 0;
    const mockLoop: EmergencyHaltable = {
      triggerEmergencyHalt: vi.fn(() => {
        const start = performance.now();
        // simulate instantaneous fail-closed circuit breaker trip
        haltExecutionTimeMs = performance.now() - start;
      }),
    };

    watchdog = new FeedFreshnessWatchdog({
      maxStalenessMs: 5000,
      emergencyHaltTimeoutMs: 100,
    });
    watchdog.attachToLoop(mockLoop);

    const tripStart = performance.now();
    watchdog.trip('Stall detected', 'binance', 'ETH/USDT', 5100);
    const totalTripTimeMs = performance.now() - tripStart;

    expect(mockLoop.triggerEmergencyHalt).toHaveBeenCalledWith('Stall detected');
    expect(haltExecutionTimeMs).toBeLessThanOrEqual(100);
    expect(totalTripTimeMs).toBeLessThanOrEqual(100);
  });

  it('listens to multiplexer events correctly', () => {
    const mux = new EventEmitter();
    watchdog = new FeedFreshnessWatchdog();
    watchdog.attachToMultiplexer(mux);

    mux.emit('tick', { venueId: 'binance', symbol: 'BTC/USDT', timestamp: 12345 });
    expect(watchdog.getVenueLag('binance', 'BTC/USDT', 12345)).toBe(0);

    mux.emit('heartbeatTimeout', 'bybit', new Error('Timeout'));
    expect(watchdog.isTripped()).toBe(true);
  });

  it('resets cleanly after trip', () => {
    watchdog = new FeedFreshnessWatchdog();
    watchdog.trip('Testing trip', 'binance');
    expect(watchdog.isTripped()).toBe(true);

    watchdog.reset();
    expect(watchdog.isTripped()).toBe(false);
    expect(watchdog.getState()).toBe('HEALTHY');
    expect(watchdog.getLastTripEvent()).toBeUndefined();
  });
});
