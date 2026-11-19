import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { buildL2ArchiveManifest, verifyL2ArchiveManifest, verifyWalRestoreParity } from '../../../src/desk/polymarket/l2/l2-archive-manifest';
import { estimateL2CollectionStorageAndCost } from '../../../src/desk/polymarket/l2/l2-collector-cost-model';
import { computeReconnectDelayMs, discoverCollectorTokens, L2CollectorRuntime } from '../../../src/desk/polymarket/l2/l2-collector-runtime';
import { readPolyBookWalDirectory } from '../../../src/desk/polymarket/l2/poly-book-wal-bridge';

async function startWsServer(): Promise<{ wss: WebSocketServer; url: string }> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((res) => wss.once('listening', () => res()));
  const addr = wss.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { wss, url: `ws://127.0.0.1:${port}` };
}

describe('l2-collector-runtime', () => {
  let outDir: string;
  beforeEach(async () => { outDir = await mkdtemp(join(tmpdir(), 'l2-collector-rt-')); });
  afterEach(async () => { await rm(outDir, { recursive: true, force: true }); });

  it('discovers bounded tokens without excluding illiquid or 50-50 markets', async () => {
    const mockFetch = (async () => new Response(JSON.stringify([
      { clobTokenIds: '["tok-illiquid-yes","tok-illiquid-no"]', volume24hr: 0, category: 'politics', enableOrderBook: true },
      { clobTokenIds: ['tok-5050-yes', 'tok-5050-no'], volume24hr: 12.5, category: 'crypto', enableOrderBook: true },
      { clobTokenIds: ['tok-disabled'], volume24hr: 50000, category: 'crypto', enableOrderBook: false },
      { clobTokenIds: ['tok-extra'], volume24hr: 999999, category: 'sports', enableOrderBook: true },
    ]), { status: 200 })) as unknown as typeof fetch;

    const all = await discoverCollectorTokens({ maxMarkets: 2, minVolume24hUsd: 0 }, 'https://mock.gamma', mockFetch);
    expect(all).toEqual(['tok-illiquid-yes', 'tok-illiquid-no', 'tok-5050-yes', 'tok-5050-no']);

    const catFiltered = await discoverCollectorTokens({ maxMarkets: 5, allowlistCategories: ['crypto'] }, 'https://mock.gamma', mockFetch);
    expect(catFiltered).toEqual(['tok-5050-yes', 'tok-5050-no']);
  });

  it('captures WAL v3 frames, rotates segments with SHA-256 manifest, and passes restore parity (fail-closed on tamper/symlink)', async () => {
    const { wss, url } = await startWsServer();
    wss.on('connection', (sock) => {
      sock.once('message', () => {
        sock.send(JSON.stringify({ event_type: 'book', asset_id: 'tok-a', timestamp: '1700000000000', bids: [{ price: '0.49', size: '50' }], asks: [{ price: '0.51', size: '60' }] }));
        setTimeout(() => {
          sock.send(JSON.stringify({ event_type: 'price_change', timestamp: '1700000000300', price_changes: [{ asset_id: 'tok-a', price: '0.50', size: '25', side: 'BUY' }] }));
        }, 120);
      });
    });

    try {
      const rt = new L2CollectorRuntime({ outDir, durationSec: 0.45, rotateIntervalSec: 0.2, tokenIds: ['tok-a'], wsUrl: url, installSignalHandlers: false });
      const summary = await rt.start();

      expect(summary.readOnly).toBe(true);
      expect(summary.health.status).toBe('HEALTHY');
      expect(summary.health.framesWritten).toBeGreaterThanOrEqual(3);
      expect(summary.health.rotatedSegments).toBeGreaterThanOrEqual(1);
      expect(rt.getActiveHandles()).toEqual({ openSocket: false, timers: 0, signalListeners: 0 });
      expect(rt.getHealth().status).toBe('HALTED');

      const emittedManifest = JSON.parse(await readFile(summary.manifestPath, 'utf8'));
      expect(verifyL2ArchiveManifest(summary.captureDir, emittedManifest).ok).toBe(true);

      // Restore parity drill: copy -> verify manifest -> replay -> identical replayHash
      const restoreDir = join(outDir, 'restore');
      await cp(summary.captureDir, restoreDir, { recursive: true });
      const parity = await verifyWalRestoreParity(summary.captureDir, restoreDir);
      expect(parity.ok).toBe(true);
      expect(parity.replayHashMatched).toBe(true);
      expect(parity.continuityOk).toBe(true);

      // Fail-closed on tampered segment
      const firstSeg = join(restoreDir, summary.manifest.files[0]!.relativePath);
      const bytes = await readFile(firstSeg);
      bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
      await writeFile(firstSeg, bytes);
      const tampered = await verifyWalRestoreParity(summary.captureDir, restoreDir);
      expect(tampered.ok).toBe(false);
      expect(tampered.manifestCheck.ok).toBe(false);

      // Fail-closed on symlink inside archive
      const symDir = join(outDir, 'sym-archive');
      await cp(summary.captureDir, symDir, { recursive: true });
      await symlink(firstSeg, join(symDir, 'wal', 'segment_00000000000000000099.wal'));
      expect(() => buildL2ArchiveManifest(symDir)).toThrow(/symlink rejected/i);
    } finally {
      await new Promise<void>((res) => wss.close(() => res()));
    }
  });

  it('detects sequence gap and triggers forced full-book resnapshot recovery', async () => {
    const { wss, url } = await startWsServer();
    wss.on('connection', (sock) => {
      sock.once('message', () => {
        sock.send(JSON.stringify({ event_type: 'book', asset_id: 'tok-gap', sequence: 1, timestamp: '1700000000000', bids: [{ price: '0.45', size: '10' }], asks: [{ price: '0.55', size: '10' }] }));
        // Jump from seq 1 -> seq 5 triggers gap detection + resnapshot
        sock.send(JSON.stringify({ event_type: 'price_change', asset_id: 'tok-gap', sequence: 5, timestamp: '1700000000200', price_changes: [{ asset_id: 'tok-gap', price: '0.46', size: '5', side: 'BUY' }] }));
      });
    });

    let resnapshotCalls = 0;
    try {
      const rt = new L2CollectorRuntime({
        outDir, durationSec: 0.35, tokenIds: ['tok-gap'], wsUrl: url, installSignalHandlers: false,
        fetchResnapshot: async (assetId) => {
          resnapshotCalls += 1;
          return { t: 1_700_000_000_250, assetId, eventType: 'book', bids: [{ price: '0.47', size: '20' }], asks: [{ price: '0.53', size: '30' }] };
        },
      });
      const summary = await rt.start();
      expect(resnapshotCalls).toBe(1);
      expect(summary.health.gapCount).toBe(1);
      expect(summary.health.resyncCount).toBe(1);
      expect(summary.health.lastResyncAtIso).not.toBeNull();
      expect(summary.health.status).toBe('HEALTHY');

      const replayed = await readPolyBookWalDirectory(summary.walDir, { onCorruption: 'throw' });
      expect(replayed.continuity.sequenceGaps).toBe(1);
      expect(replayed.continuity.sourceResets).toBe(1);
      expect(replayed.continuity.corruptFrames).toBe(0);
    } finally {
      await new Promise<void>((res) => wss.close(() => res()));
    }
  });

  it('triggers stall watchdog reconnect with deterministic bounded exponential backoff', async () => {
    const d0 = computeReconnectDelayMs(0, 500, 10_000, 42);
    const d1 = computeReconnectDelayMs(1, 500, 10_000, 42);
    const d10 = computeReconnectDelayMs(10, 500, 10_000, 42);
    expect(d0).toBe(computeReconnectDelayMs(0, 500, 10_000, 42));
    expect(d1).toBeGreaterThan(d0);
    expect(d10).toBeLessThanOrEqual(10_000);

    const { wss, url } = await startWsServer();
    let connections = 0;
    wss.on('connection', () => { connections += 1; /* intentionally silent to trigger stall watchdog */ });
    try {
      const rt = new L2CollectorRuntime({
        outDir, durationSec: 0.45, tokenIds: ['tok-stall'], wsUrl: url, installSignalHandlers: false,
        stallThresholdMs: 80, pingIntervalMs: 60, baseBackoffMs: 40, maxBackoffMs: 120,
      });
      const summary = await rt.start();
      expect(connections).toBeGreaterThanOrEqual(2);
      expect(summary.health.reconnectCount).toBeGreaterThanOrEqual(1);
      expect(rt.getActiveHandles()).toEqual({ openSocket: false, timers: 0, signalListeners: 0 });
    } finally {
      await new Promise<void>((res) => wss.close(() => res()));
    }
  });

  it('computes empirical storage and cost projections for 50 / 150 / 300 markets', () => {
    // 100_000 bytes over 3600s for 10 markets => 10_000 bytes/market-hour
    const report = estimateL2CollectionStorageAndCost({
      measuredBytes: 100_000, durationSec: 3600, measuredMarkets: 10, compressionRatioRange: [4, 5], r2RateUsdPerGbMonth: 0.015,
    });
    expect(report.bytesPerMarketHour).toBe(10_000);
    expect(report.projections.map((p) => p.targetMarkets)).toEqual([50, 150, 300]);

    const p50 = report.projections[0]!;
    const p300 = report.projections[2]!;
    // 10_000 * 50 * 24 = 12_000_000 bytes/day = 0.012 GB/day
    expect(p50.rawWalGbPerDay).toBeCloseTo(0.012, 6);
    expect(p50.zstdParquetGbPerDay.min).toBeCloseTo(0.0024, 6);
    expect(p50.zstdParquetGbPerDay.max).toBeCloseTo(0.003, 6);
    expect(p300.rawWalGbPerDay).toBeCloseTo(p50.rawWalGbPerDay * 6, 5);
    expect(p300.totalMonthlyUsdRange[0]).toBeGreaterThanOrEqual(p300.vpsMonthlyUsdRange[0]);

    expect(() => estimateL2CollectionStorageAndCost({ measuredBytes: -1, durationSec: 10, measuredMarkets: 1 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ measuredBytes: 100, durationSec: 0, measuredMarkets: 1 })).toThrow(RangeError);
  });
});
