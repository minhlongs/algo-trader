/**
 * Polymarket CLOB V2 — Periodic `POST /heartbeats` Deadman Service.
 * Aborts overlapping ticks, notes HTTP 425 restarts, and fires killSwitch on >= 2 misses.
 */

import type { PolyKillSwitch } from '../risk/poly-kill-switch';
import { ENGINE_RESTARTING_HTTP_STATUS } from './clob-v2-venue-constants';
import type { EngineRestartCooldown } from './clob-v2-submit-classifier';

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
export const DEFAULT_MAX_MISSED_HEARTBEATS = 2;

export interface ClobV2HeartbeatOptions {
  host?: string;
  intervalMs?: number;
  maxMissedHeartbeats?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  getHeaders?: (body: string) => Record<string, string> | Promise<Record<string, string>>;
  killSwitch?: PolyKillSwitch;
  engineCooldown?: EngineRestartCooldown;
  nowMs?: () => number;
}

export interface ClobV2HeartbeatTickResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  consecutiveMisses: number;
  deadmanTriggered: boolean;
  heartbeatId: string;
  error?: string;
}

export interface ClobV2HeartbeatTelemetry {
  running: boolean;
  intervalMs: number;
  totalSent: number;
  totalAcked: number;
  consecutiveMisses: number;
  lastLatencyMs: number | null;
  maxLatencyMs: number;
  lastSuccessAtMs: number | null;
  lastHeartbeatId: string;
  lastError: string | null;
  deadmanTriggered: boolean;
}

export class ClobV2HeartbeatService {
  private readonly host: string;
  private readonly intervalMs: number;
  private readonly maxMissedHeartbeats: number;
  private readonly fetchImpl?: typeof fetch;
  private readonly headers?: Record<string, string>;
  private readonly getHeaders?: (body: string) => Record<string, string> | Promise<Record<string, string>>;
  private readonly killSwitch?: PolyKillSwitch;
  private readonly engineCooldown?: EngineRestartCooldown;
  private readonly clock: () => number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlightAbort: AbortController | null = null;
  private tickSequence = 0;
  private lastSuccessSeq = 0;
  private totalSent = 0;
  private totalAcked = 0;
  private consecutiveMisses = 0;
  private lastLatencyMs: number | null = null;
  private maxLatencyMs = 0;
  private lastSuccessAtMs: number | null = null;
  private lastHeartbeatId = '';
  private lastError: string | null = null;
  private deadmanTriggered = false;

  constructor(options: ClobV2HeartbeatOptions = {}) {
    const intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    const maxMissed = options.maxMissedHeartbeats ?? DEFAULT_MAX_MISSED_HEARTBEATS;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error('ClobV2HeartbeatService: intervalMs must be a positive finite number');
    }
    if (!Number.isInteger(maxMissed) || maxMissed < 1) {
      throw new Error('ClobV2HeartbeatService: maxMissedHeartbeats must be a positive integer');
    }
    this.host = (options.host ?? 'https://clob.polymarket.com').replace(/\/+$/, '');
    this.intervalMs = intervalMs;
    this.maxMissedHeartbeats = maxMissed;
    this.fetchImpl = options.fetchImpl;
    this.headers = options.headers;
    this.getHeaders = options.getHeaders;
    this.killSwitch = options.killSwitch;
    this.engineCooldown = options.engineCooldown;
    this.clock = options.nowMs ?? (() => Date.now());
  }

  start(): void {
    if (this.timer !== null) return;
    const handle = setInterval(() => { void this.beatOnce(); }, this.intervalMs);
    if (typeof (handle as { unref?: () => void }).unref === 'function') (handle as { unref: () => void }).unref();
    this.timer = handle;
  }

  stop(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.inFlightAbort?.abort();
    this.inFlightAbort = null;
  }

  async beatOnce(): Promise<ClobV2HeartbeatTickResult> {
    this.inFlightAbort?.abort();
    const ac = new AbortController();
    this.inFlightAbort = ac;
    const seq = ++this.tickSequence;
    const startedAt = this.clock();
    this.totalSent += 1;
    const payload = JSON.stringify({ heartbeat_id: this.lastHeartbeatId });
    const reqTimeoutMs = Math.max(1, Math.min(Math.floor(this.intervalMs * 0.9), 4_500));
    const timeoutTimer = setTimeout(() => ac.abort(new Error('heartbeat-timeout')), reqTimeoutMs);

    try {
      const doFetch = this.fetchImpl ?? fetch;
      const dynHeaders = this.getHeaders ? await this.getHeaders(payload) : {};
      const res = await doFetch(`${this.host}/heartbeats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.headers ?? {}), ...dynHeaders },
        body: payload,
        signal: ac.signal,
      });
      const finishedAt = this.clock();
      const latencyMs = Math.max(0, finishedAt - startedAt);
      this.lastLatencyMs = latencyMs;
      this.maxLatencyMs = Math.max(this.maxLatencyMs, latencyMs);

      if (res.status === ENGINE_RESTARTING_HTTP_STATUS) this.engineCooldown?.noteEngineRestart(finishedAt);
      if (seq < this.tickSequence) return this.supersededResult(res.status, latencyMs);
      if (res.status === ENGINE_RESTARTING_HTTP_STATUS) return await this.recordMiss(res.status, latencyMs, 'http 425 engine restarting');
      if (!res.ok) return await this.recordMiss(res.status, latencyMs, `http ${res.status}`);

      const rawText = await res.text();
      if (seq < this.tickSequence) return this.supersededResult(res.status, latencyMs);
      this.extractHeartbeatId(rawText);
      this.lastSuccessSeq = seq;
      this.totalAcked += 1;
      this.consecutiveMisses = 0;
      this.lastSuccessAtMs = finishedAt;
      this.lastError = null;
      return {
        ok: true, status: res.status, latencyMs, consecutiveMisses: 0,
        deadmanTriggered: this.deadmanTriggered, heartbeatId: this.lastHeartbeatId,
      };
    } catch (err) {
      const latencyMs = Math.max(0, this.clock() - startedAt);
      this.lastLatencyMs = latencyMs;
      this.maxLatencyMs = Math.max(this.maxLatencyMs, latencyMs);
      if (this.lastSuccessSeq > seq) return this.supersededResult(0, latencyMs);
      return await this.recordMiss(0, latencyMs, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timeoutTimer);
      if (this.inFlightAbort === ac) this.inFlightAbort = null;
    }
  }

  getTelemetry(): ClobV2HeartbeatTelemetry {
    return {
      running: this.timer !== null, intervalMs: this.intervalMs,
      totalSent: this.totalSent, totalAcked: this.totalAcked,
      consecutiveMisses: this.consecutiveMisses, lastLatencyMs: this.lastLatencyMs,
      maxLatencyMs: this.maxLatencyMs, lastSuccessAtMs: this.lastSuccessAtMs,
      lastHeartbeatId: this.lastHeartbeatId, lastError: this.lastError,
      deadmanTriggered: this.deadmanTriggered,
    };
  }

  private supersededResult(status: number, latencyMs: number): ClobV2HeartbeatTickResult {
    return {
      ok: false, status, latencyMs, consecutiveMisses: this.consecutiveMisses,
      deadmanTriggered: this.deadmanTriggered, heartbeatId: this.lastHeartbeatId, error: 'superseded-heartbeat-tick',
    };
  }

  private extractHeartbeatId(rawText: string): void {
    if (!rawText) return;
    try {
      const parsed = JSON.parse(rawText) as { heartbeat_id?: unknown; heartbeatID?: unknown };
      const id = typeof parsed.heartbeat_id === 'string' ? parsed.heartbeat_id : typeof parsed.heartbeatID === 'string' ? parsed.heartbeatID : '';
      if (id) this.lastHeartbeatId = id;
    } catch { /* Non-JSON 200 ACK is valid */ }
  }

  private async recordMiss(status: number, latencyMs: number, error: string): Promise<ClobV2HeartbeatTickResult> {
    this.consecutiveMisses += 1;
    this.lastError = error;
    if (this.consecutiveMisses >= this.maxMissedHeartbeats) {
      this.deadmanTriggered = true;
      if (this.killSwitch) await this.killSwitch.fire('heartbeat-deadman-missed');
    }
    return {
      ok: false, status, latencyMs, consecutiveMisses: this.consecutiveMisses,
      deadmanTriggered: this.deadmanTriggered, heartbeatId: this.lastHeartbeatId, error,
    };
  }
}
