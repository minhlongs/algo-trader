import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildL2ArchiveManifest,
  computeDeterministicReplayHash,
  verifyL2ArchiveManifest,
  verifyWalRestoreParity,
} from '../../../src/desk/polymarket/l2/l2-archive-manifest';
import {
  encodePolyBookWalRecord,
  type PolyBookPersistedRecord,
} from '../../../src/desk/polymarket/l2/poly-book-wal-codec';
import { encodePolyBookWalFrame } from '../../../src/desk/polymarket/l2/poly-book-wal-crc32c';
import { readPolyBookWalDirectory } from '../../../src/desk/polymarket/l2/poly-book-wal-bridge';

function buildValidWalSegment(): Buffer {
  const records: PolyBookPersistedRecord[] = [
    {
      tag: 'Book', assetId: 'tok-alpha', kind: 'Snapshot', side: 'Bid',
      priceRaw: 4800, price: '0.4800', sizeRaw: 100_000_000n, size: '100.000000',
      provenance: { recvTimestampUs: 1_700_000_000_000_000, exchangeTimestampUs: 1_700_000_000_000_000, source: 'WebSocket', sequence: 1, ingestOrdinal: 1 },
    },
    {
      tag: 'Book', assetId: 'tok-alpha', kind: 'Snapshot', side: 'Ask',
      priceRaw: 5200, price: '0.5200', sizeRaw: 120_000_000n, size: '120.000000',
      provenance: { recvTimestampUs: 1_700_000_000_000_000, exchangeTimestampUs: 1_700_000_000_000_000, source: 'WebSocket', sequence: 1, ingestOrdinal: 2 },
    },
    {
      tag: 'Book', assetId: 'tok-alpha', kind: 'Delta', side: 'Bid',
      priceRaw: 4900, price: '0.4900', sizeRaw: 50_000_000n, size: '50.000000',
      provenance: { recvTimestampUs: 1_700_000_000_250_000, exchangeTimestampUs: 1_700_000_000_200_000, source: 'WebSocket', sequence: 2, ingestOrdinal: 3 },
    },
  ];
  return Buffer.concat(records.map((r) => encodePolyBookWalFrame(encodePolyBookWalRecord(r))));
}

describe('l2-archive-manifest', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'l2-manifest-test-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('builds deterministic sorted manifest over .wal, .jsonl, .parquet and verifies cleanly', async () => {
    await mkdir(join(rootDir, 'wal'), { recursive: true });
    await mkdir(join(rootDir, 'parquet', 'dt=2026-11-19'), { recursive: true });
    await writeFile(join(rootDir, 'wal', 'segment_00000000000000000000.wal'), buildValidWalSegment());
    await writeFile(join(rootDir, 'parquet', 'dt=2026-11-19', 'part-0.parquet'), Buffer.from('PAR1-mock-parquet-bytes-PAR1'));
    await writeFile(join(rootDir, 'events.jsonl'), '{"t":1}\n');
    await writeFile(join(rootDir, 'README.txt'), 'ignored non-archive file');

    const manifest = buildL2ArchiveManifest(rootDir);
    expect(manifest.fileCount).toBe(3);
    expect(manifest.files.map((f) => f.relativePath)).toEqual([
      'events.jsonl',
      'parquet/dt=2026-11-19/part-0.parquet',
      'wal/segment_00000000000000000000.wal',
    ]);
    expect(manifest.manifestSha256).toMatch(/^[0-9a-f]{64}$/);

    const verified = verifyL2ArchiveManifest(rootDir, manifest);
    expect(verified).toEqual({ ok: true, missing: [], mismatched: [], unexpected: [] });
  });

  it('detects tampering on WAL and Parquet files as well as missing and unexpected files', async () => {
    await mkdir(join(rootDir, 'wal'), { recursive: true });
    const walPath = join(rootDir, 'wal', 'segment_00000000000000000000.wal');
    const parquetPath = join(rootDir, 'part-0.parquet');
    const jsonlPath = join(rootDir, 'log.jsonl');
    await writeFile(walPath, buildValidWalSegment());
    await writeFile(parquetPath, Buffer.from('PAR1-original-PAR1'));
    await writeFile(jsonlPath, '{"ok":true}\n');

    const manifest = buildL2ArchiveManifest(rootDir);

    // Flip 1 byte in WAL and Parquet, delete jsonl, add unexpected parquet
    const walBytes = await readFile(walPath);
    walBytes[walBytes.length - 1] = walBytes[walBytes.length - 1]! ^ 0xff;
    await writeFile(walPath, walBytes);
    await writeFile(parquetPath, Buffer.from('PAR1-tampered-PAR1'));
    await unlink(jsonlPath);
    await writeFile(join(rootDir, 'extra.parquet'), Buffer.from('PAR1-extra-PAR1'));

    const res = verifyL2ArchiveManifest(rootDir, manifest);
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(['log.jsonl']);
    expect(res.mismatched).toEqual(['part-0.parquet', 'wal/segment_00000000000000000000.wal']);
    expect(res.unexpected).toEqual(['extra.parquet']);
  });

  it('verifies WAL restore parity with identical deterministic replayHash', async () => {
    const origDir = join(rootDir, 'orig');
    const restDir = join(rootDir, 'restored');
    await mkdir(join(origDir, 'wal'), { recursive: true });
    await writeFile(join(origDir, 'wal', 'segment_00000000000000000000.wal'), buildValidWalSegment());
    await cp(origDir, restDir, { recursive: true });

    const parity = await verifyWalRestoreParity(origDir, restDir);
    expect(parity.ok).toBe(true);
    expect(parity.manifestCheck.ok).toBe(true);
    expect(parity.replayHashMatched).toBe(true);
    expect(parity.continuityOk).toBe(true);
    expect(parity.originalReplayHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parity.originalReplayHash).toBe(parity.restoredReplayHash);
    expect(parity.originalSteps).toBe(2);
    expect(parity.restoredSteps).toBe(2);

    // Verify deterministic replay hash changes if book steps change
    const replayed = await readPolyBookWalDirectory(join(origDir, 'wal'));
    const h1 = computeDeterministicReplayHash(replayed.steps);
    const mutated = replayed.steps.map((s, idx) =>
      idx === 0 ? { ...s, bids: [{ price: '0.4700', size: '100.000000' }] } : s,
    );
    expect(computeDeterministicReplayHash(mutated)).not.toBe(h1);
  });

  it('fails closed when restored WAL segment is corrupted', async () => {
    const origDir = join(rootDir, 'orig');
    const restDir = join(rootDir, 'restored');
    await mkdir(join(origDir, 'wal'), { recursive: true });
    const walBuf = buildValidWalSegment();
    await writeFile(join(origDir, 'wal', 'segment_00000000000000000000.wal'), walBuf);
    await cp(origDir, restDir, { recursive: true });

    // Corrupt a payload byte in restored WAL so CRC32C check fails
    const restWalPath = join(restDir, 'wal', 'segment_00000000000000000000.wal');
    const corrupted = Buffer.from(walBuf);
    corrupted[12] = corrupted[12]! ^ 0x55;
    await writeFile(restWalPath, corrupted);

    const parity = await verifyWalRestoreParity(origDir, restDir);
    expect(parity.ok).toBe(false);
    expect(parity.manifestCheck.ok).toBe(false);
    expect(parity.replayHashMatched).toBe(false);
    expect(parity.continuityOk).toBe(false);
    expect(parity.error).toContain('CRC32C mismatch');
  });
});
