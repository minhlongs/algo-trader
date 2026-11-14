import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GOLDEN_V3_HEX,
  decodePolyBookWalRecord,
  encodePolyBookWalRecord,
  formatFixedPrice,
  formatFixedSize,
  type PolyBookPersistedRecord,
} from '../../../src/desk/polymarket/l2/poly-book-wal-codec';
import {
  PolyBookWalCorruptionError,
  crc32c,
  encodePolyBookWalFrame,
  polyBookFrameCrc,
  scanPolyBookWalFrames,
} from '../../../src/desk/polymarket/l2/poly-book-wal-crc32c';
import {
  readPolyBookWalDirectory,
  replayPolyBookWalRecords,
} from '../../../src/desk/polymarket/l2/poly-book-wal-bridge';
import { replayRows } from '../../../src/desk/polymarket/l2/l2-replay';
import { isRecordedL2Row } from '../../../src/desk/polymarket/l2/l2-event-types';
import {
  L2_SOURCE_POLY_BOOK_PARQUET,
  L2_SOURCE_POLY_BOOK_WAL,
} from '../../../src/desk/polymarket/l2/l2-source-labels';
import { verifyKpiProvenance } from '../../../src/desk/cli/kpi-poly-source-guard';

const tempDirs: string[] = [];

async function createWalTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'poly-book-wal-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe('poly-book WAL CRC32C + bincode v3 codec + replay bridge', () => {
  it('computes hardware Castagnoli CRC32C and decodes/re-encodes GOLDEN_V3_HEX byte-for-byte', () => {
    const checkBytes = new TextEncoder().encode('123456789');
    expect(crc32c(checkBytes)).toBe(0xe3069283);

    const goldenBytes = Uint8Array.from(Buffer.from(GOLDEN_V3_HEX, 'hex'));
    const decoded = decodePolyBookWalRecord(goldenBytes);

    expect(decoded).toEqual({
      tag: 'Book',
      assetId: 'tok1',
      kind: 'Delta',
      side: 'Bid',
      priceRaw: 5000,
      price: '0.5000',
      sizeRaw: 100_000_000n,
      size: '100.000000',
      provenance: {
        recvTimestampUs: 1_700_000_000_000_000,
        exchangeTimestampUs: 1_699_999_999_000_000,
        source: 'WebSocket',
        sourceEventId: 'evt-1',
        sourceSessionId: undefined,
        sequence: 42,
        ingestOrdinal: 7,
      },
    });

    const reencodedHex = Buffer.from(encodePolyBookWalRecord(decoded)).toString('hex');
    expect(reencodedHex).toBe(GOLDEN_V3_HEX);

    // Exact u64 precision above 2^53 (9_007_199_254_740_993)
    expect(formatFixedSize(9_007_199_254_740_993n)).toBe('9007199254.740993');
    expect(formatFixedPrice(10)).toBe('0.0010');
    expect(() => formatFixedPrice(10_001)).toThrow(PolyBookWalCorruptionError);
  });

  it('roundtrips all five PersistedRecord variants (Book, Trade, Ingest, Checkpoint, Validation)', () => {
    const variants: PolyBookPersistedRecord[] = [
      {
        tag: 'Trade',
        assetId: 'tok1',
        priceRaw: 5500,
        price: '0.5500',
        sizeRaw: 50_000_000n,
        size: '50.000000',
        side: 'Ask',
        tradeId: 'tx-abc',
        fidelity: 'Full',
        provenance: {
          recvTimestampUs: 3_000_000,
          exchangeTimestampUs: 2_999_000,
          source: 'WebSocket',
          sourceEventId: 'hash-1',
        },
      },
      {
        tag: 'Ingest',
        assetId: 'tok1',
        kind: 'SequenceGap',
        provenance: {
          recvTimestampUs: 2_000_000,
          exchangeTimestampUs: 1_999_000,
          source: 'WebSocket',
        },
        expectedSequence: 5,
        observedSequence: 8,
        details: 'gap detected',
      },
      {
        tag: 'Checkpoint',
        assetId: 'tok1',
        checkpointTimestampUs: 4_000_000,
        provenance: {
          recvTimestampUs: 4_000_000,
          exchangeTimestampUs: 3_999_000,
          source: 'RestSnapshot',
        },
        bids: [{ price: '0.5000', size: '100.000000' }],
        asks: [{ price: '0.5100', size: '200.000000' }],
        walOffset: 12345,
      },
      {
        tag: 'Validation',
        assetId: 'tok1',
        mode: 'recv_time',
        replayTimestampUs: 5_000_000,
        referenceTimestampUs: 4_999_000,
        matched: true,
        persistedAtUs: 5_001_000,
      },
    ];

    for (const rec of variants) {
      const framed = encodePolyBookWalFrame(encodePolyBookWalRecord(rec));
      const scanned = scanPolyBookWalFrames(framed, 1);
      expect(scanned.frames).toHaveLength(1);
      expect(decodePolyBookWalRecord(scanned.frames[0]!.payload)).toEqual(rec);
    }
  });

  it('rejects payload bit-flips, length-field corruption, and older codec versions', () => {
    const goldenBytes = Uint8Array.from(Buffer.from(GOLDEN_V3_HEX, 'hex'));
    const frame = encodePolyBookWalFrame(goldenBytes);

    // Flip 1 bit in payload
    const flippedPayload = Uint8Array.from(frame);
    flippedPayload[20] ^= 0x01;
    expect(() => scanPolyBookWalFrames(flippedPayload, 42)).toThrowError(PolyBookWalCorruptionError);
    try {
      scanPolyBookWalFrames(flippedPayload, 42);
    } catch (err) {
      expect(err).toBeInstanceOf(PolyBookWalCorruptionError);
      expect((err as PolyBookWalCorruptionError).reason).toBe('crc_mismatch');
      expect((err as PolyBookWalCorruptionError).segmentId).toBe(42);
    }

    // Corrupt length prefix to smaller in-bounds length (covered by length-inclusive CRC)
    const flippedLen = Uint8Array.from(frame);
    flippedLen[0] = 4;
    expect(() => scanPolyBookWalFrames(flippedLen, 7)).toThrowError(PolyBookWalCorruptionError);

    // Older codec v2 payload with valid CRC must be rejected with drain hint
    const v2Payload = Uint8Array.from(goldenBytes);
    v2Payload[0] = 2;
    const v2Frame = new Uint8Array(8 + v2Payload.length);
    const view = new DataView(v2Frame.buffer);
    view.setUint32(0, v2Payload.length, true);
    view.setUint32(4, polyBookFrameCrc(v2Payload.length, v2Payload), true);
    v2Frame.set(v2Payload, 8);

    expect(() => scanPolyBookWalFrames(v2Frame, 9)).toThrow(/drain the WAL/);
  });

  it('reads multi-segment WAL directory, tolerates active torn/zero tail, and reports continuity anomalies', async () => {
    const walDir = await createWalTempDir();

    const seg1Records: PolyBookPersistedRecord[] = [
      {
        tag: 'Checkpoint',
        assetId: 'tokA',
        checkpointTimestampUs: 1_000_000,
        provenance: { recvTimestampUs: 1_000_000, exchangeTimestampUs: 1_000_000, source: 'RestSnapshot', sequence: 10 },
        bids: [{ price: '0.4800', size: '100.000000' }],
        asks: [{ price: '0.5200', size: '150.000000' }],
      },
      {
        tag: 'Ingest',
        assetId: 'tokA',
        kind: 'SequenceGap',
        provenance: { recvTimestampUs: 1_001_000, exchangeTimestampUs: 1_001_000, source: 'WebSocket' },
        expectedSequence: 11,
        observedSequence: 14,
        details: 'missed 3 frames',
      },
      {
        tag: 'Book',
        assetId: 'tokA',
        kind: 'Delta',
        side: 'Bid',
        priceRaw: 4900,
        price: '0.4900',
        sizeRaw: 80_000_000n,
        size: '80.000000',
        provenance: { recvTimestampUs: 1_002_000, exchangeTimestampUs: 1_002_000, source: 'WebSocket', sequence: 14 },
      },
    ];

    const seg2Records: PolyBookPersistedRecord[] = [
      {
        tag: 'Ingest',
        assetId: 'tokA',
        kind: 'BookMismatch',
        provenance: { recvTimestampUs: 1_003_000, exchangeTimestampUs: 1_003_000, source: 'WebSocket' },
        details: 'venue top-of-book diverged',
      },
      {
        tag: 'Ingest',
        assetId: 'tokA',
        kind: 'SourceReset',
        provenance: { recvTimestampUs: 1_004_000, exchangeTimestampUs: 1_004_000, source: 'WebSocket' },
        details: 'reconnect session boundary',
      },
      {
        tag: 'Book',
        assetId: 'tokA',
        kind: 'Snapshot',
        side: 'Bid',
        priceRaw: 5000,
        price: '0.5000',
        sizeRaw: 200_000_000n,
        size: '200.000000',
        provenance: { recvTimestampUs: 1_005_000, exchangeTimestampUs: 1_005_000, source: 'WebSocket', sequence: 1 },
      },
      {
        tag: 'Book',
        assetId: 'tokA',
        kind: 'Snapshot',
        side: 'Ask',
        priceRaw: 5100,
        price: '0.5100',
        sizeRaw: 120_000_000n,
        size: '120.000000',
        provenance: { recvTimestampUs: 1_005_000, exchangeTimestampUs: 1_005_000, source: 'WebSocket', sequence: 1 },
      },
    ];

    const seg1Buf = Buffer.concat([
      ...seg1Records.map((r) => Buffer.from(encodePolyBookWalFrame(encodePolyBookWalRecord(r)))),
      Buffer.alloc(64, 0), // preallocated zero-filled tail on closed segment
    ]);
    // Active segment 2 ends with a torn partial frame (claims 50 bytes, only 3 written)
    const tornTail = Buffer.alloc(11);
    tornTail.writeUInt32LE(50, 0);
    tornTail.writeUInt32LE(0xdeadbeef, 4);
    const seg2Buf = Buffer.concat([
      ...seg2Records.map((r) => Buffer.from(encodePolyBookWalFrame(encodePolyBookWalRecord(r)))),
      tornTail,
    ]);

    await writeFile(join(walDir, 'segment_00000000000000000002.wal'), seg2Buf);
    await writeFile(join(walDir, 'segment_00000000000000000001.wal'), seg1Buf);
    await writeFile(join(walDir, 'consumer_serve.pos'), '1:0');

    const res = await readPolyBookWalDirectory(walDir);
    expect(res.continuity).toEqual({
      validFrames: 7,
      corruptFrames: 0,
      sequenceGaps: 1,
      bookMismatches: 1,
      sourceResets: 1,
      assetsSeen: ['tokA'],
    });

    expect(res.rows.every((r) => isRecordedL2Row(r))).toBe(true);
    expect(res.steps).toHaveLength(3);
    // Final book after SourceReset + fresh Snapshot must NOT retain pre-reset 0.4800/0.4900 bids
    expect(res.steps[2]!.bids).toEqual([{ price: '0.5000', size: '200.000000' }]);
    expect(res.steps[2]!.asks).toEqual([{ price: '0.5100', size: '120.000000' }]);

    // KPI provenance guard natively accepts poly-book-wal & poly-book-parquet and rejects synthetic-regime
    const provenanceSummary = verifyKpiProvenance({
      snapshots: [],
      priceRows: [],
      tradeRows: [],
      l2Steps: [
        ...res.steps,
        {
          ...res.steps[0]!,
          source: L2_SOURCE_POLY_BOOK_PARQUET,
          row: { ...res.steps[0]!.row, source: L2_SOURCE_POLY_BOOK_PARQUET },
        },
      ],
    });
    expect(provenanceSummary.sourcesSeen).toEqual([L2_SOURCE_POLY_BOOK_PARQUET, L2_SOURCE_POLY_BOOK_WAL]);
    expect(() =>
      verifyKpiProvenance({
        snapshots: [],
        priceRows: [{ source: 'synthetic-regime' as never, t: 1000, tokenId: 'tokA', price: 0.5 }],
        tradeRows: [],
        l2Steps: [],
      }),
    ).toThrow(/synthetic-regime/);
  });

  it('produces exact ReplayedBookStep parity and distinguishes recv_time vs exchange_time ordering', () => {
    const records: PolyBookPersistedRecord[] = [
      {
        tag: 'Book',
        assetId: 'tok1',
        kind: 'Snapshot',
        side: 'Bid',
        priceRaw: 4500,
        price: '0.4500',
        sizeRaw: 100_000_000n,
        size: '100.000000',
        provenance: {
          recvTimestampUs: 2_000_000,
          exchangeTimestampUs: 2_000_000,
          source: 'WebSocket',
          sequence: 1,
          ingestOrdinal: 1,
        },
      },
      // Arrived earlier on recv clock (2_010_000) with size 50, but has LATER exchange timestamp (2_030_000)
      {
        tag: 'Book',
        assetId: 'tok1',
        kind: 'Delta',
        side: 'Bid',
        priceRaw: 4500,
        price: '0.4500',
        sizeRaw: 50_000_000n,
        size: '50.000000',
        provenance: {
          recvTimestampUs: 2_010_000,
          exchangeTimestampUs: 2_030_000,
          source: 'WebSocket',
          sequence: 2,
          ingestOrdinal: 2,
        },
      },
      // Arrived later on recv clock (2_020_000) removing level (size 0), but has EARLIER exchange timestamp (2_015_000)
      {
        tag: 'Book',
        assetId: 'tok1',
        kind: 'Delta',
        side: 'Bid',
        priceRaw: 4500,
        price: '0.4500',
        sizeRaw: 0n,
        size: '0.000000',
        provenance: {
          recvTimestampUs: 2_020_000,
          exchangeTimestampUs: 2_015_000,
          source: 'WebSocket',
          sequence: 3,
          ingestOrdinal: 3,
        },
      },
    ];

    const recvReplay = replayPolyBookWalRecords(records, { mode: 'recv_time' });
    const exchReplay = replayPolyBookWalRecords(records, { mode: 'exchange_time' });

    // Exact parity with replayRows(rows)
    expect(recvReplay.steps).toEqual(replayRows(recvReplay.rows));
    expect(exchReplay.steps).toEqual(replayRows(exchReplay.rows));

    // In recv_time order, size=50 is applied first, then size=0 removes the bid level:
    expect(recvReplay.steps.at(-1)!.bids).toEqual([]);

    // In exchange_time order, size=0 (2_015_000) applies before size=50 (2_030_000), leaving 50:
    expect(exchReplay.steps.at(-1)!.bids).toEqual([{ price: '0.4500', size: '50.000000' }]);
    expect(exchReplay.steps.at(-1)!.recvTimestampUs).toBe(2_010_000);
    expect(exchReplay.steps.at(-1)!.exchangeTimestampUs).toBe(2_030_000);
    expect(exchReplay.steps.at(-1)!.ingestOrdinal).toBe(2);
  });
});
