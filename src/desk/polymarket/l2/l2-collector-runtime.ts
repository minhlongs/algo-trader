/** Continuous read-only Polymarket L2 collector coordinator (WAL v3, gap resync, stall watchdog, rotation, SHA-256 manifest). */
import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildL2ArchiveManifest, type L2ArchiveManifest } from './l2-archive-manifest';
import type { RecordedL2Row } from './l2-event-types';
import { normalizeMarketMessage } from './l2-message-normalizer';
import { encodeRowsToWalFrames } from './l2-public-capture-drill';
import { encodePolyBookWalRecord, type PolyBookPersistedRecord } from './poly-book-wal-codec';
import { encodePolyBookWalFrame } from './poly-book-wal-crc32c';

const DEFAULT_WS = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const DEFAULT_GAMMA = 'https://gamma-api.polymarket.com';
const DEFAULT_CLOB = 'https://clob.polymarket.com';

export type CollectorStatus = 'HEALTHY' | 'DEGRADED' | 'HALTED';
export interface CollectorDiscoveryConfig { maxMarkets?: number; minVolume24hUsd?: number; allowlistCategories?: readonly string[] }
export interface CollectorRuntimeOptions {
  outDir: string; durationSec?: number; rotateIntervalSec?: number; stallThresholdMs?: number; pingIntervalMs?: number;
  baseBackoffMs?: number; maxBackoffMs?: number; jitterSeed?: number; discovery?: CollectorDiscoveryConfig;
  tokenIds?: readonly string[]; wsUrl?: string; gammaUrl?: string; clobRestUrl?: string; installSignalHandlers?: boolean;
  fetchImpl?: typeof fetch; fetchResnapshot?: (assetId: string) => Promise<RecordedL2Row | null>;
}
export interface CollectorHealthSnapshot {
  uptimeMs: number; framesWritten: number; bytesWritten: number; gapCount: number; resyncCount: number;
  lastResyncAtIso: string | null; reconnectCount: number; corruptFrames: number; rotatedSegments: number;
  activeAssets: number; estimatedGbPerDay: number; status: CollectorStatus;
}
export interface CollectorRunSummary {
  readOnly: true; startedAtIso: string; finishedAtIso: string; captureDir: string; walDir: string;
  manifestPath: string; tokensSubscribed: string[]; manifest: L2ArchiveManifest; health: CollectorHealthSnapshot;
}

export function computeReconnectDelayMs(attempt: number, baseMs = 500, maxMs = 30_000, seed = 1337): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, Math.min(attempt, 16)));
  const jitter = ((Math.imul((attempt + 1) ^ seed, 2654435761) >>> 0) % 1000) / 1000;
  return Math.min(maxMs, Math.max(1, Math.round(exp * (0.75 + jitter * 0.5))));
}

export async function discoverCollectorTokens(
  config: CollectorDiscoveryConfig = {}, gammaUrl = DEFAULT_GAMMA, fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const maxMarkets = Math.max(1, Math.floor(config.maxMarkets ?? 50)), minVol = Math.max(0, config.minVolume24hUsd ?? 0);
  const cats = config.allowlistCategories?.length ? new Set(config.allowlistCategories.map((c) => c.toLowerCase())) : null;
  const resp = await fetchImpl(`${gammaUrl}/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=${Math.min(500, Math.max(maxMarkets * 10, 50))}`, { signal: AbortSignal.timeout(8_000) });
  if (!resp.ok) throw new Error(`Gamma discovery HTTP ${resp.status}`);
  const eligible: string[][] = [];
  for (const m of (await resp.json()) as Array<{ clobTokenIds?: unknown; volume24hr?: unknown; category?: unknown; enableOrderBook?: unknown; acceptingOrders?: unknown }>) {
    if (m.enableOrderBook === false || m.acceptingOrders === false) continue;
    const vol = typeof m.volume24hr === 'number' ? m.volume24hr : Number(m.volume24hr ?? 0);
    if (minVol > 0 && (!Number.isFinite(vol) || vol < minVol)) continue;
    if (cats && (typeof m.category !== 'string' || !cats.has(m.category.toLowerCase()))) continue;
    let parsed: unknown = m.clobTokenIds;
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { continue; } }
    if (!Array.isArray(parsed)) continue;
    const ids = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) eligible.push(ids);
  }
  const picked = eligible.length >= maxMarkets * 2 && maxMarkets >= 4
    ? Array.from({ length: maxMarkets }, (_, i) => eligible[Math.floor((i * eligible.length) / maxMarkets)]!)
    : eligible.slice(0, maxMarkets);
  return [...new Set(picked.flat())];
}

function extractExplicitSeqs(raw: string): Map<string, number> {
  const out = new Map<string, number>();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return out; }
  for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>, seq = typeof r.sequence === 'number' ? r.sequence : typeof r.seq === 'number' ? r.seq : undefined;
    if (seq !== undefined && Number.isInteger(seq) && typeof r.asset_id === 'string') out.set(r.asset_id, seq);
  }
  return out;
}

export class L2CollectorRuntime {
  private readonly opts: CollectorRuntimeOptions;
  private readonly captureDir: string; private readonly walDir: string; private readonly manifestPath: string;
  private ws: WebSocket | null = null; private timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = [];
  private sigs: Array<{ sig: NodeJS.Signals; fn: () => void }> = []; private running = false; private connected = false;
  private stalled = false; private wasConnected = false; private startedAtMs = 0; private lastFrameAtMs = 0;
  private segmentId = 0; private segmentHasData = false; private pendingFrames: Uint8Array[] = [];
  private seqByAsset = new Map<string, number>(); private resyncInFlight = new Set<string>();
  private ordinalState = { ordinal: 0 }; private tokens: string[] = []; private framesWritten = 0; private bytesWritten = 0;
  private gapCount = 0; private resyncCount = 0; private lastResyncAtIso: string | null = null; private reconnectCount = 0;
  private corruptFrames = 0; private rotatedSegments = 0; private attempt = 0; private stopResolve: (() => void) | null = null;
  private msgChain: Promise<void> = Promise.resolve(); private flushChain: Promise<L2ArchiveManifest> | null = null;

  constructor(options: CollectorRuntimeOptions) {
    this.opts = options; this.captureDir = join(resolve(options.outDir), 'capture');
    this.walDir = join(this.captureDir, 'wal'); this.manifestPath = join(this.captureDir, 'manifest.json');
  }

  getHealth(summaryMode = false): CollectorHealthSnapshot {
    const uptimeMs = this.startedAtMs > 0 ? Math.max(1, Date.now() - this.startedAtMs) : 0;
    const estimatedGbPerDay = uptimeMs > 0 ? Math.round(((this.bytesWritten / uptimeMs) * 86_400_000 / 1e9) * 1e6) / 1e6 : 0;
    const isLive = summaryMode ? this.wasConnected && this.framesWritten > 0 : this.running && this.connected;
    const status: CollectorStatus = (!summaryMode && !this.running) || this.corruptFrames > 0 ? 'HALTED'
      : (!isLive || this.stalled || this.gapCount > this.resyncCount ? 'DEGRADED' : 'HEALTHY');
    return { uptimeMs, framesWritten: this.framesWritten, bytesWritten: this.bytesWritten, gapCount: this.gapCount, resyncCount: this.resyncCount, lastResyncAtIso: this.lastResyncAtIso, reconnectCount: this.reconnectCount, corruptFrames: this.corruptFrames, rotatedSegments: this.rotatedSegments, activeAssets: this.tokens.length, estimatedGbPerDay, status };
  }

  getActiveHandles(): { openSocket: boolean; timers: number; signalListeners: number } { return { openSocket: this.ws !== null, timers: this.timers.length, signalListeners: this.sigs.length }; }

  async start(): Promise<CollectorRunSummary> {
    this.startedAtMs = Date.now(); this.lastFrameAtMs = this.startedAtMs; this.running = true;
    await mkdir(this.walDir, { recursive: true });
    this.tokens = this.opts.tokenIds?.length ? [...this.opts.tokenIds] : await discoverCollectorTokens(this.opts.discovery, this.opts.gammaUrl ?? DEFAULT_GAMMA, this.opts.fetchImpl ?? fetch);
    if (this.tokens.length === 0) throw new Error('no_public_tokens_discovered');
    if (this.opts.installSignalHandlers !== false) for (const sig of ['SIGTERM', 'SIGINT'] as const) { const fn = (): void => { void this.stop(); }; process.once(sig, fn); this.sigs.push({ sig, fn }); }
    const rotateMs = Math.max(200, Math.round((this.opts.rotateIntervalSec ?? 3600) * 1_000));
    const stallMs = Math.max(50, this.opts.stallThresholdMs ?? 30_000), pingMs = Math.max(50, this.opts.pingIntervalMs ?? 10_000);
    this.timers.push(setInterval(() => { void this.rotateSegment(); }, rotateMs));
    this.timers.push(setInterval(() => {
      if (this.running && this.ws?.readyState === WebSocket.OPEN) {
        if (Date.now() - this.lastFrameAtMs >= stallMs) { this.stalled = true; try { this.ws.close(); } catch { /* ignore */ } }
        else { try { this.ws.send('PING'); } catch { /* ignore */ } }
      }
    }, Math.min(pingMs, stallMs)));
    if (this.opts.durationSec && this.opts.durationSec > 0) this.timers.push(setTimeout(() => { void this.stop(); }, Math.round(this.opts.durationSec * 1_000)));
    this.connect();
    await new Promise<void>((res) => { this.stopResolve = res; });
    await this.msgChain;
    const manifest = await this.flushAndEmitManifest(true);
    return { readOnly: true, startedAtIso: new Date(this.startedAtMs).toISOString(), finishedAtIso: new Date().toISOString(), captureDir: this.captureDir, walDir: this.walDir, manifestPath: this.manifestPath, tokensSubscribed: [...this.tokens], manifest, health: this.getHealth(true) };
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false; this.connected = false;
    for (const t of this.timers) clearTimeout(t);
    for (const { sig, fn } of this.sigs) process.removeListener(sig, fn);
    this.timers = []; this.sigs = [];
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } this.ws = null; }
    const res = this.stopResolve; this.stopResolve = null; if (res) res();
  }

  async rotateSegment(): Promise<L2ArchiveManifest> { return this.flushAndEmitManifest(true); }

  private connect(): void {
    if (!this.running) return;
    const ws = new WebSocket(this.opts.wsUrl ?? DEFAULT_WS); this.ws = ws;
    ws.addEventListener('open', () => { this.connected = true; this.wasConnected = true; this.stalled = false; this.attempt = 0; this.lastFrameAtMs = Date.now(); ws.send(JSON.stringify({ type: 'market', assets_ids: this.tokens })); });
    ws.addEventListener('message', (evt) => { this.lastFrameAtMs = Date.now(); this.stalled = false; this.msgChain = this.msgChain.then(() => this.handleMessage(typeof evt.data === 'string' ? evt.data : String(evt.data))); });
    ws.addEventListener('error', () => { try { ws.close(); } catch { /* ignore */ } });
    ws.addEventListener('close', () => {
      if (this.ws === ws) this.ws = null;
      this.connected = false; if (!this.running) return;
      this.reconnectCount += 1;
      this.timers.push(setTimeout(() => this.connect(), computeReconnectDelayMs(this.attempt++, this.opts.baseBackoffMs, this.opts.maxBackoffMs, this.opts.jitterSeed)));
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    const nowMs = Date.now(), nowUs = nowMs * 1_000, rows = normalizeMarketMessage(raw, nowMs);
    if (rows.length === 0) return;
    const seqs = extractExplicitSeqs(raw);
    for (const row of rows) {
      const obs = seqs.get(row.assetId), prev = this.seqByAsset.get(row.assetId);
      if (obs !== undefined && prev !== undefined && obs > prev + 1) {
        this.gapCount += 1;
        this.pushRec({ tag: 'Ingest', assetId: row.assetId, kind: 'SequenceGap', expectedSequence: prev + 1, observedSequence: obs, provenance: { recvTimestampUs: nowUs, exchangeTimestampUs: row.t * 1_000, source: 'WebSocket', ingestOrdinal: ++this.ordinalState.ordinal } });
        await this.triggerResnapshot(row.assetId); continue;
      }
      this.appendFrames(encodeRowsToWalFrames([row], this.seqByAsset, this.ordinalState, nowUs));
    }
  }

  private appendFrames(frames: readonly Uint8Array[]): void { for (const f of frames) { this.pendingFrames.push(f); this.framesWritten += 1; this.bytesWritten += f.byteLength; } }
  private pushRec(rec: PolyBookPersistedRecord): void { this.appendFrames([encodePolyBookWalFrame(encodePolyBookWalRecord(rec))]); }

  private async triggerResnapshot(assetId: string): Promise<void> {
    if (this.resyncInFlight.has(assetId)) return;
    this.resyncInFlight.add(assetId);
    try {
      const snap = this.opts.fetchResnapshot ? await this.opts.fetchResnapshot(assetId) : await this.defaultResnapshot(assetId);
      if (!snap) return;
      const nowUs = Date.now() * 1_000;
      this.pushRec({ tag: 'Ingest', assetId, kind: 'SourceReset', details: 'forced_resnapshot_after_gap', provenance: { recvTimestampUs: nowUs, exchangeTimestampUs: snap.t * 1_000, source: 'RestSnapshot', ingestOrdinal: ++this.ordinalState.ordinal } });
      this.seqByAsset.delete(assetId); this.appendFrames(encodeRowsToWalFrames([snap], this.seqByAsset, this.ordinalState, nowUs));
      this.resyncCount += 1; this.lastResyncAtIso = new Date().toISOString();
    } finally { this.resyncInFlight.delete(assetId); }
  }

  private async defaultResnapshot(assetId: string): Promise<RecordedL2Row | null> {
    const resp = await (this.opts.fetchImpl ?? fetch)(`${this.opts.clobRestUrl ?? DEFAULT_CLOB}/book?token_id=${encodeURIComponent(assetId)}`, { signal: AbortSignal.timeout(5_000) });
    return resp.ok ? normalizeMarketMessage(JSON.stringify({ ...(await resp.json() as Record<string, unknown>), event_type: 'book', asset_id: assetId }), Date.now())[0] ?? null : null;
  }

  private flushAndEmitManifest(advance: boolean): Promise<L2ArchiveManifest> {
    const run = async (): Promise<L2ArchiveManifest> => {
      if (this.pendingFrames.length > 0) { await appendFile(join(this.walDir, `segment_${String(this.segmentId).padStart(20, '0')}.wal`), Buffer.concat(this.pendingFrames.splice(0))); this.segmentHasData = true; }
      if (advance && this.segmentHasData) { this.segmentId += 1; this.segmentHasData = false; this.rotatedSegments += 1; }
      const manifest = buildL2ArchiveManifest(this.captureDir), tmp = `${this.manifestPath}.tmp`;
      await writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`); await rename(tmp, this.manifestPath);
      return manifest;
    };
    return (this.flushChain = (this.flushChain ?? Promise.resolve()).then(run, run));
  }
}
