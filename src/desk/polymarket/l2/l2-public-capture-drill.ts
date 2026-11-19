/** Bounded read-only Polymarket L2 public capture drill (WAL v3 + SHA-256 manifest + restore parity). */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildL2ArchiveManifest, verifyWalRestoreParity, type L2ArchiveManifest, type L2RestoreVerificationResult } from './l2-archive-manifest';
import type { RecordedL2Row } from './l2-event-types';
import { normalizeMarketMessage } from './l2-message-normalizer';
import { encodePolyBookWalRecord, formatFixedPrice, formatFixedSize, type PolyBookPersistedRecord } from './poly-book-wal-codec';
import { encodePolyBookWalFrame } from './poly-book-wal-crc32c';

const DEFAULT_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const DEFAULT_GAMMA_URL = 'https://gamma-api.polymarket.com';

export type CaptureBackend = 'poly-book' | 'ws-fallback' | 'injected';

export interface CaptureRunnerContext { captureDir: string; walDir: string; durationMs: number; tokenIds?: string[] }
export interface CaptureRunnerResult { backend: CaptureBackend; tokensSubscribed: string[]; framesWritten: number; error?: string }

export interface PublicCaptureDrillOptions {
  outDir: string; durationSec?: number; tokenIds?: string[]; preferPolyBook?: boolean;
  buildPolyBookIfMissing?: boolean; repoRoot?: string; wsUrl?: string; gammaUrl?: string;
  captureRunner?: (ctx: CaptureRunnerContext) => Promise<CaptureRunnerResult>;
}

export interface PublicCaptureDrillReport {
  status: 'CAPTURE_READY' | 'HOLD'; holdReason: string | null; backend: CaptureBackend; readOnly: true;
  startedAtIso: string; finishedAtIso: string; durationMs: number; captureDir: string; restoreDir: string;
  tokensSubscribed: string[]; manifest: L2ArchiveManifest; restoreParity: L2RestoreVerificationResult; activeChildPids: number[];
}

const activePids = new Map<number, ChildProcess>();

function resolvePolyBookBinary(repoRoot: string): string | null {
  if (process.env.POLY_BOOK_BIN && existsSync(process.env.POLY_BOOK_BIN)) return process.env.POLY_BOOK_BIN;
  for (const rel of ['target/release/poly-book', 'target/debug/poly-book']) {
    const candidate = join(repoRoot, 'sidecars', 'poly-book', rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function terminateChild(child: ChildProcess, graceMs = 2_000): Promise<void> {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) { if (pid !== undefined) activePids.delete(pid); return; }
  const exited = new Promise<void>((res) => { child.once('close', () => res()); child.once('exit', () => res()); });
  try { child.kill('SIGTERM'); } catch { /* exited */ }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const graceful = await Promise.race([exited.then(() => true), new Promise<boolean>((r) => { timer = setTimeout(() => r(false), graceMs); })]);
  if (timer !== undefined) clearTimeout(timer);
  if (!graceful && child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch { /* exited */ } await exited; }
  activePids.delete(pid);
}

async function runBoundedChild(cmd: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<void> {
  const child = spawn(cmd, [...args], { cwd, env, stdio: 'ignore' });
  if (child.pid !== undefined) activePids.set(child.pid, child);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const done = new Promise<void>((res, rej) => { child.once('error', rej); child.once('close', () => res()); });
    timer = setTimeout(() => { void terminateChild(child); }, timeoutMs);
    await done;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await terminateChild(child);
  }
}

async function discoverPublicTokens(gammaUrl: string): Promise<string[]> {
  const resp = await fetch(`${gammaUrl}/markets?active=true&closed=false&limit=10&order=volume24hr&ascending=false`, { signal: AbortSignal.timeout(8_000) });
  if (!resp.ok) throw new Error(`Gamma discovery HTTP ${resp.status}`);
  const markets = (await resp.json()) as Array<{ clobTokenIds?: unknown }>;
  const tokens: string[] = [];
  for (const m of markets) {
    const parsed: unknown = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
    if (!Array.isArray(parsed)) continue;
    for (const id of parsed) {
      if (typeof id === 'string' && id.length > 0 && !tokens.includes(id)) tokens.push(id);
      if (tokens.length >= 4) return tokens;
    }
  }
  return tokens;
}

export function encodeRowsToWalFrames(rows: readonly RecordedL2Row[], seqByAsset: Map<string, number>, state: { ordinal: number }, nowUs: number): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (const row of rows) {
    const emit = (kind: 'Snapshot' | 'Delta', side: 'Bid' | 'Ask', price: string, size: string, seq: number): void => {
      const pRaw = Math.round(Number(price) * 10_000), sNum = Number(size);
      const scaledSize = Math.round(sNum * 1_000_000);
      const exchangeUs = row.t * 1_000;
      if (!Number.isInteger(pRaw) || pRaw < 0 || pRaw > 10_000 || !Number.isSafeInteger(scaledSize) || scaledSize < 0 || row.t < 0 || !Number.isSafeInteger(exchangeUs)) return;
      const sRaw = BigInt(scaledSize);
      const rec: PolyBookPersistedRecord = {
        tag: 'Book', assetId: row.assetId, kind, side, priceRaw: pRaw, price: formatFixedPrice(pRaw), sizeRaw: sRaw, size: formatFixedSize(sRaw),
        provenance: { recvTimestampUs: nowUs, exchangeTimestampUs: exchangeUs, source: 'WebSocket', sequence: seq, ingestOrdinal: ++state.ordinal },
      };
      frames.push(encodePolyBookWalFrame(encodePolyBookWalRecord(rec)));
    };
    if (row.eventType === 'book') {
      const seq = (seqByAsset.get(row.assetId) ?? 0) + 1;
      seqByAsset.set(row.assetId, seq);
      for (const l of row.bids) emit('Snapshot', 'Bid', l.price, l.size, seq);
      for (const l of row.asks) emit('Snapshot', 'Ask', l.price, l.size, seq);
    } else {
      for (const [side, lvls] of [['Bid', row.bids], ['Ask', row.asks]] as const) {
        for (const l of lvls) {
          const seq = (seqByAsset.get(row.assetId) ?? 0) + 1;
          seqByAsset.set(row.assetId, seq);
          emit('Delta', side, l.price, l.size, seq);
        }
      }
    }
  }
  return frames;
}

async function runPublicWsFallback(ctx: CaptureRunnerContext, wsUrl: string, gammaUrl: string): Promise<CaptureRunnerResult> {
  let tokens = ctx.tokenIds?.length ? [...ctx.tokenIds] : [];
  try { if (tokens.length === 0) tokens = await discoverPublicTokens(gammaUrl); }
  catch (err: unknown) { return { backend: 'ws-fallback', tokensSubscribed: [], framesWritten: 0, error: err instanceof Error ? err.message : String(err) }; }
  if (tokens.length === 0) return { backend: 'ws-fallback', tokensSubscribed: [], framesWritten: 0, error: 'no_public_tokens_discovered' };
  const frames: Uint8Array[] = [], seqByAsset = new Map<string, number>(), state = { ordinal: 0 };
  let wsError: string | undefined;
  await new Promise<void>((done) => {
    let settled = false;
    const ws = new WebSocket(wsUrl);
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    const finish = (): void => {
      if (settled) return;
      settled = true; clearTimeout(stopTimer);
      if (pingTimer !== undefined) clearInterval(pingTimer);
      try { if (ws.readyState <= WebSocket.OPEN) ws.close(); } catch { /* ignore */ }
      done();
    };
    const stopTimer = setTimeout(finish, ctx.durationMs);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'market', assets_ids: tokens }));
      pingTimer = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('PING'); }, 10_000);
    });
    ws.addEventListener('message', (evt) => {
      try {
        const nowMs = Date.now(), rows = normalizeMarketMessage(typeof evt.data === 'string' ? evt.data : String(evt.data), nowMs);
        if (rows.length > 0) frames.push(...encodeRowsToWalFrames(rows, seqByAsset, state, nowMs * 1_000));
      } catch (err: unknown) {
        wsError = err instanceof Error ? err.message : String(err);
        finish();
      }
    });
    ws.addEventListener('error', () => { wsError = 'websocket_connection_error'; finish(); });
    ws.addEventListener('close', finish);
  });
  if (frames.length > 0) await writeFile(join(ctx.walDir, 'segment_00000000000000000000.wal'), Buffer.concat(frames));
  return { backend: 'ws-fallback', tokensSubscribed: tokens, framesWritten: frames.length, ...(wsError ? { error: wsError } : {}) };
}

export async function runPublicL2CaptureDrill(options: PublicCaptureDrillOptions): Promise<PublicCaptureDrillReport> {
  const startedAt = Date.now(), durationMs = Math.max(1_000, Math.round((options.durationSec ?? 30) * 1_000));
  const outDir = resolve(options.outDir), captureDir = join(outDir, 'capture'), walDir = join(captureDir, 'wal'), restoreDir = join(outDir, 'restore');
  await rm(walDir, { recursive: true, force: true });
  await mkdir(walDir, { recursive: true });
  const repoRoot = options.repoRoot ?? process.cwd();
  let runResult: CaptureRunnerResult;
  if (options.captureRunner) {
    runResult = await options.captureRunner({ captureDir, walDir, durationMs, tokenIds: options.tokenIds });
  } else {
    let bin = options.preferPolyBook === false ? null : resolvePolyBookBinary(repoRoot);
    if (!bin && options.buildPolyBookIfMissing) {
      const darwinEnv = process.platform === 'darwin'
        ? { CC: process.env.CC ?? '/usr/bin/cc', CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER: process.env.CC ?? '/usr/bin/cc' }
        : {};
      const env = { ...process.env, ...darwinEnv };
      await runBoundedChild('cargo', ['build', '--release', '--bin', 'poly-book'], join(repoRoot, 'sidecars', 'poly-book'), env, 180_000).catch(() => null);
      bin = resolvePolyBookBinary(repoRoot);
    }
    if (bin) {
      const args = options.tokenIds?.length ? ['ingest', '--tokens', options.tokenIds.join(','), '--parquet=true', '--metrics=false'] : ['ingest', '--auto-rotate', '--parquet=true', '--metrics=false'];
      await runBoundedChild(bin, args, join(repoRoot, 'sidecars', 'poly-book'), { ...process.env, PB__WAL__BASE_PATH: walDir, PB__STORAGE__PARQUET_BASE_PATH: captureDir }, durationMs);
      runResult = { backend: 'poly-book', tokensSubscribed: options.tokenIds ?? ['auto-rotate:btc-5m'], framesWritten: 0 };
    } else {
      runResult = await runPublicWsFallback({ captureDir, walDir, durationMs, tokenIds: options.tokenIds }, options.wsUrl ?? DEFAULT_WS_URL, options.gammaUrl ?? DEFAULT_GAMMA_URL);
    }
  }
  const manifest = buildL2ArchiveManifest(captureDir);
  await rm(restoreDir, { recursive: true, force: true });
  await cp(captureDir, restoreDir, { recursive: true });
  const restoreParity = await verifyWalRestoreParity(captureDir, restoreDir);
  const holdReason = runResult.error ?? restoreParity.error
    ?? (!restoreParity.originalContinuity || restoreParity.originalContinuity.validFrames === 0 ? 'zero_valid_frames_captured'
    : !restoreParity.ok ? 'restore_parity_or_continuity_failed' : null);
  return {
    status: holdReason === null ? 'CAPTURE_READY' : 'HOLD', holdReason, backend: runResult.backend, readOnly: true,
    startedAtIso: new Date(startedAt).toISOString(), finishedAtIso: new Date().toISOString(), durationMs: Date.now() - startedAt,
    captureDir, restoreDir, tokensSubscribed: runResult.tokensSubscribed, manifest, restoreParity, activeChildPids: [...activePids.keys()],
  };
}
