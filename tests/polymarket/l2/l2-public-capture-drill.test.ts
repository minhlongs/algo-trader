import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runPublicL2CaptureDrill,
  type CaptureRunnerContext,
  type CaptureRunnerResult,
} from '../../../src/desk/polymarket/l2/l2-public-capture-drill';
import {
  encodePolyBookWalRecord,
  type PolyBookPersistedRecord,
} from '../../../src/desk/polymarket/l2/poly-book-wal-codec';
import { encodePolyBookWalFrame } from '../../../src/desk/polymarket/l2/poly-book-wal-crc32c';

function makeSyntheticWal(records: readonly PolyBookPersistedRecord[]): Buffer {
  return Buffer.concat(records.map((r) => encodePolyBookWalFrame(encodePolyBookWalRecord(r))));
}

function makeCleanRecords(): PolyBookPersistedRecord[] {
  return [
    {
      tag: 'Book', assetId: 'tok-btc-yes', kind: 'Snapshot', side: 'Bid',
      priceRaw: 5100, price: '0.5100', sizeRaw: 80_000_000n, size: '80.000000',
      provenance: { recvTimestampUs: 1_700_000_000_000_000, exchangeTimestampUs: 1_700_000_000_000_000, source: 'WebSocket', sequence: 1, ingestOrdinal: 1 },
    },
    {
      tag: 'Book', assetId: 'tok-btc-yes', kind: 'Snapshot', side: 'Ask',
      priceRaw: 5300, price: '0.5300', sizeRaw: 95_000_000n, size: '95.000000',
      provenance: { recvTimestampUs: 1_700_000_000_000_000, exchangeTimestampUs: 1_700_000_000_000_000, source: 'WebSocket', sequence: 1, ingestOrdinal: 2 },
    },
    {
      tag: 'Book', assetId: 'tok-btc-yes', kind: 'Delta', side: 'Bid',
      priceRaw: 5200, price: '0.5200', sizeRaw: 40_000_000n, size: '40.000000',
      provenance: { recvTimestampUs: 1_700_000_000_500_000, exchangeTimestampUs: 1_700_000_000_450_000, source: 'WebSocket', sequence: 2, ingestOrdinal: 3 },
    },
  ];
}

describe('l2-public-capture-drill', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'l2-capture-drill-test-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it('returns CAPTURE_READY when valid WAL v3 segments are captured and restore parity passes', async () => {
    const runner = async (ctx: CaptureRunnerContext): Promise<CaptureRunnerResult> => {
      const buf = makeSyntheticWal(makeCleanRecords());
      await writeFile(join(ctx.walDir, 'segment_00000000000000000000.wal'), buf);
      return { backend: 'injected', tokensSubscribed: ['tok-btc-yes'], framesWritten: 3 };
    };

    const report = await runPublicL2CaptureDrill({ outDir, durationSec: 1, captureRunner: runner });
    expect(report.status).toBe('CAPTURE_READY');
    expect(report.holdReason).toBeNull();
    expect(report.readOnly).toBe(true);
    expect(report.activeChildPids).toEqual([]);
    expect(report.manifest.fileCount).toBe(1);
    expect(report.restoreParity.ok).toBe(true);
    expect(report.restoreParity.replayHashMatched).toBe(true);
    expect(report.restoreParity.originalContinuity?.validFrames).toBe(3);
  });

  it('returns HOLD when zero valid frames are captured', async () => {
    const runner = async (): Promise<CaptureRunnerResult> => ({
      backend: 'injected', tokensSubscribed: ['tok-empty'], framesWritten: 0,
    });

    const report = await runPublicL2CaptureDrill({ outDir, durationSec: 1, captureRunner: runner });
    expect(report.status).toBe('HOLD');
    expect(report.holdReason).toBe('zero_valid_frames_captured');
    expect(report.restoreParity.ok).toBe(false);
  });

  it('returns HOLD with error reason when capture runner reports network failure', async () => {
    const runner = async (): Promise<CaptureRunnerResult> => ({
      backend: 'ws-fallback', tokensSubscribed: [], framesWritten: 0, error: 'websocket_connection_error',
    });

    const report = await runPublicL2CaptureDrill({ outDir, durationSec: 1, captureRunner: runner });
    expect(report.status).toBe('HOLD');
    expect(report.holdReason).toBe('websocket_connection_error');
  });

  it('returns HOLD when captured WAL contains a sequence gap', async () => {
    const records = makeCleanRecords();
    // Introduce sequence gap: jump from seq 1 to seq 5
    const gapped: PolyBookPersistedRecord[] = [
      records[0]!,
      records[1]!,
      { ...records[2]!, provenance: { ...records[2]!.provenance, sequence: 5 } } as PolyBookPersistedRecord,
    ];
    const runner = async (ctx: CaptureRunnerContext): Promise<CaptureRunnerResult> => {
      await writeFile(join(ctx.walDir, 'segment_00000000000000000000.wal'), makeSyntheticWal(gapped));
      return { backend: 'injected', tokensSubscribed: ['tok-btc-yes'], framesWritten: 3 };
    };

    const report = await runPublicL2CaptureDrill({ outDir, durationSec: 1, captureRunner: runner });
    expect(report.status).toBe('HOLD');
    expect(report.holdReason).toBe('restore_parity_or_continuity_failed');
    expect(report.restoreParity.originalContinuity?.sequenceGaps).toBe(1);
    expect(report.restoreParity.continuityOk).toBe(false);
  });

  it('returns HOLD when captured WAL segment has CRC corruption', async () => {
    const runner = async (ctx: CaptureRunnerContext): Promise<CaptureRunnerResult> => {
      const buf = makeSyntheticWal(makeCleanRecords());
      buf[10] = buf[10]! ^ 0xff;
      await writeFile(join(ctx.walDir, 'segment_00000000000000000000.wal'), buf);
      return { backend: 'injected', tokensSubscribed: ['tok-btc-yes'], framesWritten: 3 };
    };

    const report = await runPublicL2CaptureDrill({ outDir, durationSec: 1, captureRunner: runner });
    expect(report.status).toBe('HOLD');
    expect(report.holdReason).toContain('CRC32C mismatch');
    expect(report.restoreParity.ok).toBe(false);
  });
});
