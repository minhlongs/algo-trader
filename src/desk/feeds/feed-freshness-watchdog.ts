/**
 * Feed Freshness Watchdog & Dead-Man Switch
 * Milestone M2: Streaming Feeds & Freshness Watchdog
 */

import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/logger';
import type {
  EmergencyHaltable,
  FeedWatchdogOptions,
  FreshnessStatus,
  StaleFeedRecord,
  WatchdogState,
  WatchdogTargetMultiplexer,
  WatchdogTripEvent,
} from './feed-freshness-watchdog-types';

export class FeedFreshnessWatchdog extends EventEmitter {
  private readonly maxStalenessMs: number;
  private readonly checkIntervalMs: number;
  private readonly warningThresholdMs: number;
  private readonly haltOnTrip: boolean;
  private readonly onFeedStale?: (venue: string, latencyMs: number) => void;
  private readonly onTrip?: (event: WatchdogTripEvent) => void;

  private readonly lastTickTimes = new Map<string, number>();
  private readonly lastHeartbeatTimes = new Map<string, number>();
  private state: WatchdogState = 'HEALTHY';
  private timer: NodeJS.Timeout | null = null;
  private haltTarget?: EmergencyHaltable;
  private lastTripEvent?: WatchdogTripEvent;

  constructor(
    optionsOrStaleness: FeedWatchdogOptions | number = {},
    legacyOnFeedStale?: (venue: string, latencyMs: number) => void,
  ) {
    super();
    const options: FeedWatchdogOptions = typeof optionsOrStaleness === 'number'
      ? { maxStalenessMs: optionsOrStaleness, onFeedStale: legacyOnFeedStale }
      : optionsOrStaleness;
    this.maxStalenessMs = options.maxStalenessMs ?? 5000;
    this.checkIntervalMs = options.checkIntervalMs ?? 250;
    this.warningThresholdMs = options.warningThresholdMs ?? 2000;
    this.haltOnTrip = options.haltOnTrip ?? true;
    this.onFeedStale = options.onFeedStale;
    this.onTrip = options.onTrip;
  }

  public start(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.checkFreshness(), this.checkIntervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public attachToLoop(loop: EmergencyHaltable): void {
    this.haltTarget = loop;
  }

  public attachToMultiplexer(mux: WatchdogTargetMultiplexer): void {
    mux.on('tick', (tick) => this.recordTick(tick.venueId, tick.symbol, tick.timestamp));
    mux.on('heartbeat', (v, ts) => this.recordHeartbeat(v, ts));
    mux.on('heartbeatTimeout', (v, err) => this.recordHeartbeatTimeout(v, err));
    mux.on('error', (v, err) => this.trip(`Feed error on ${v}: ${err.message}`, v));
  }

  public recordTick(venue: string, symbolOrTs?: string | number, timestamp?: number): void {
    if (typeof symbolOrTs === 'number' || symbolOrTs === undefined) {
      const ts = symbolOrTs ?? Date.now();
      this.lastTickTimes.set(`${venue}:*`, ts);
      this.lastHeartbeatTimes.set(venue, ts);
    } else {
      const ts = timestamp ?? Date.now();
      this.lastTickTimes.set(`${venue}:${symbolOrTs}`, ts);
      this.lastHeartbeatTimes.set(venue, ts);
    }
    if (this.state === 'DEGRADED') this.state = 'HEALTHY';
  }

  public recordHeartbeat(venue: string, timestamp = Date.now()): void {
    this.lastHeartbeatTimes.set(venue, timestamp);
    if (this.state === 'DEGRADED') this.state = 'HEALTHY';
  }

  public recordHeartbeatTimeout(venue: string, error?: Error): void {
    const reason = `Heartbeat timeout on venue ${venue}${error ? `: ${error.message}` : ''}`;
    this.trip(reason, venue, undefined, this.maxStalenessMs);
  }

  public checkFreshness(now = Date.now()): FreshnessStatus {
    const staleFeeds: StaleFeedRecord[] = [];
    let hasWarning = false;
    let worstLatencyMs = 0;

    for (const [key, lastTick] of this.lastTickTimes.entries()) {
      const elapsed = Math.max(0, now - lastTick);
      if (elapsed > worstLatencyMs) worstLatencyMs = elapsed;
      const [venueId, symbol] = key.split(':');
      if (elapsed > this.maxStalenessMs) {
        staleFeeds.push({ venueId, symbol, elapsedMs: elapsed });
      } else if (elapsed > this.warningThresholdMs) {
        hasWarning = true;
      }
    }

    for (const [venueId, lastHb] of this.lastHeartbeatTimes.entries()) {
      const elapsed = Math.max(0, now - lastHb);
      if (elapsed > worstLatencyMs) worstLatencyMs = elapsed;
      if (elapsed > this.maxStalenessMs && !staleFeeds.some((f) => f.venueId === venueId)) {
        staleFeeds.push({ venueId, symbol: '*', elapsedMs: elapsed });
      } else if (elapsed > this.warningThresholdMs) {
        hasWarning = true;
      }
    }

    if (staleFeeds.length > 0) {
      const worst = staleFeeds.reduce((max, cur) => (cur.elapsedMs > max.elapsedMs ? cur : max));
      this.trip(`Feed latency exceeded ${this.maxStalenessMs}ms`, worst.venueId, worst.symbol, worst.elapsedMs);
    } else if (hasWarning && this.state === 'HEALTHY') {
      this.state = 'DEGRADED';
    }

    const isStale = staleFeeds.length > 0;
    const staleVenues = Array.from(new Set(staleFeeds.map((f) => f.venueId)));
    return { isHealthy: this.state === 'HEALTHY', state: this.state, staleFeeds, checkedAt: now, isStale, worstLatencyMs, staleVenues };
  }

  public trip(reason: string, venue: string, symbol?: string, elapsedMs = this.maxStalenessMs): void {
    if (this.state === 'TRIPPED') return;
    this.state = 'TRIPPED';

    const event: WatchdogTripEvent = {
      reason,
      venueId: venue,
      symbol,
      elapsedMs,
      thresholdMs: this.maxStalenessMs,
      timestamp: Date.now(),
      latencyMs: elapsedMs,
    };
    this.lastTripEvent = event;
    logger.warn('Feed freshness watchdog tripped emergency halt', { venue, symbol, elapsedMs, reason });

    this.emit('trip', event);
    this.onTrip?.(event);
    this.onFeedStale?.(venue, elapsedMs);

    if (this.haltOnTrip && this.haltTarget) {
      try {
        this.haltTarget.triggerEmergencyHalt(reason);
      } catch (err) {
        logger.error('Failed to trigger emergency halt from watchdog', { reason }, err as Error);
      }
    }
  }

  public reset(): void {
    this.state = 'HEALTHY';
    this.lastTripEvent = undefined;
    const now = Date.now();
    for (const key of this.lastTickTimes.keys()) this.lastTickTimes.set(key, now);
    for (const venue of this.lastHeartbeatTimes.keys()) this.lastHeartbeatTimes.set(venue, now);
  }

  public getState(): WatchdogState {
    return this.state;
  }

  public isTripped(): boolean {
    return this.state === 'TRIPPED';
  }

  public getLastTripEvent(): WatchdogTripEvent | undefined {
    return this.lastTripEvent;
  }

  public getVenueLag(venue: string, symbol?: string, now = Date.now()): number {
    if (symbol) {
      const last = this.lastTickTimes.get(`${venue}:${symbol}`);
      return last ? Math.max(0, now - last) : Infinity;
    }
    const lastHb = this.lastHeartbeatTimes.get(venue);
    return lastHb ? Math.max(0, now - lastHb) : Infinity;
  }
}
