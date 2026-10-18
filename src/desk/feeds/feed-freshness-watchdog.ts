/**
 * Feed Freshness Watchdog & Dead-Man Switch
 * Milestone M2: Streaming Feeds & Freshness Watchdog
 */

import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/logger';
import type {
  EmergencyHaltable, FeedWatchdogOptions, FreshnessStatus, WatchdogState, WatchdogTargetMultiplexer, WatchdogTripEvent,
} from './feed-freshness-watchdog-types';
import {
  scanFeedFreshness, buildFreshnessStatus, buildWatchdogTripEvent, computeVenueLag,
  type FreshnessScanResult, type FreshnessScanInput,
} from './feed-freshness-inspector';

export { scanFeedFreshness, buildFreshnessStatus, buildWatchdogTripEvent, computeVenueLag };
export type { FreshnessScanResult, FreshnessScanInput };

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
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  public attachToLoop(loop: EmergencyHaltable): void { this.haltTarget = loop; }

  public attachToMultiplexer(mux: WatchdogTargetMultiplexer): void {
    mux.on('tick', (tick) => this.recordTick(tick.venueId, tick.symbol, tick.timestamp));
    mux.on('heartbeat', (v, ts) => this.recordHeartbeat(v, ts));
    mux.on('heartbeatTimeout', (v, err) => this.recordHeartbeatTimeout(v, err));
    mux.on('error', (v, err) => this.trip(`Feed error on ${v}: ${err.message}`, v));
  }

  public recordTick(venue: string, symbolOrTs?: string | number, timestamp?: number): void {
    const isLegacyTs = typeof symbolOrTs === 'number' || symbolOrTs === undefined;
    const ts = isLegacyTs ? (symbolOrTs ?? Date.now()) : (timestamp ?? Date.now());
    const key = isLegacyTs ? `${venue}:*` : `${venue}:${symbolOrTs}`;
    this.lastTickTimes.set(key, ts);
    this.lastHeartbeatTimes.set(venue, ts);
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
    const scan = scanFeedFreshness({
      lastTickTimes: this.lastTickTimes,
      lastHeartbeatTimes: this.lastHeartbeatTimes,
      maxStalenessMs: this.maxStalenessMs,
      warningThresholdMs: this.warningThresholdMs,
      now,
    });

    if (scan.staleFeeds.length > 0) {
      const worst = scan.staleFeeds.reduce((max, cur) => (cur.elapsedMs > max.elapsedMs ? cur : max));
      this.trip(`Feed latency exceeded ${this.maxStalenessMs}ms`, worst.venueId, worst.symbol, worst.elapsedMs);
    } else if (scan.hasWarning && this.state === 'HEALTHY') {
      this.state = 'DEGRADED';
    }

    return buildFreshnessStatus(this.state, scan, now);
  }

  public trip(reason: string, venue: string, symbol?: string, elapsedMs = this.maxStalenessMs): void {
    if (this.state === 'TRIPPED') return;
    this.state = 'TRIPPED';

    const event = buildWatchdogTripEvent(reason, venue, symbol, elapsedMs, this.maxStalenessMs);
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

  public getState(): WatchdogState { return this.state; }
  public isTripped(): boolean { return this.state === 'TRIPPED'; }
  public getLastTripEvent(): WatchdogTripEvent | undefined { return this.lastTripEvent; }

  public getVenueLag(venue: string, symbol?: string, now = Date.now()): number {
    return computeVenueLag(this.lastTickTimes, this.lastHeartbeatTimes, venue, symbol, now);
  }
}
