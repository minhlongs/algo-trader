import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildL2ArchiveManifest } from '../../../src/desk/polymarket/l2/l2-archive-manifest';
import type { L2CoveragePolicy, L2CoverageProvenance } from '../../../src/desk/polymarket/l2/l2-coverage-policy';
import { encodePolyBookWalRecord, type PolyBookPersistedRecord } from '../../../src/desk/polymarket/l2/poly-book-wal-codec';
import { encodePolyBookWalFrame } from '../../../src/desk/polymarket/l2/poly-book-wal-crc32c';

export const COVERAGE_TEST_DAY = '2026-11-18';
export const COVERAGE_TEST_NOW = '2026-11-19T12:00:00.000Z';
export const COVERAGE_TEST_SESSION = 'local-fixture-session';

/** Local encoded test fixtures, never captured market evidence or real IC approvals. */
export function coverageBookRecords(day = COVERAGE_TEST_DAY, token = 'token-yes'): PolyBookPersistedRecord[] {
  const startUs = Date.parse(`${day}T00:00:00.000Z`) * 1000;
  return [0, 6, 12, 17, 23].map((hour, index) => ({
    tag: 'Book', assetId: token, kind: index === 0 ? 'Snapshot' : 'Delta', side: 'Bid',
    priceRaw: 5000, price: '0.5000', sizeRaw: 100_000_000n, size: '100.000000',
    provenance: {
      recvTimestampUs: startUs + hour * 3_600_000_000,
      exchangeTimestampUs: startUs + hour * 3_600_000_000,
      source: 'WebSocket', sourceSessionId: COVERAGE_TEST_SESSION, sequence: index,
    },
  }));
}

export function writeCoverageWal(root: string, records: readonly PolyBookPersistedRecord[], path = 'wal/segment_0001.wal'): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), Buffer.concat(records.map((record) => encodePolyBookWalFrame(encodePolyBookWalRecord(record)))));
}

export function sealCoverageFixture(
  root: string,
  changes: Partial<L2CoveragePolicy> = {},
  alterProvenance?: (provenance: L2CoverageProvenance) => void,
): L2CoveragePolicy {
  const previous = buildL2ArchiveManifest(root);
  const universe = [{ marketId: 'market-a', tokenIds: ['token-yes'] }];
  const provenance: L2CoverageProvenance = {
    version: 1, dataKind: 'genuine-market', venue: 'polymarket', captureSource: 'public-market-feed', universe: structuredClone(universe),
    files: previous.files.filter((file) => file.relativePath !== 'capture-provenance.jsonl').map((file) => ({
      relativePath: file.relativePath, sha256: file.sha256, sourceSessionIds: [COVERAGE_TEST_SESSION],
    })),
  };
  alterProvenance?.(provenance);
  writeFileSync(join(root, 'capture-provenance.jsonl'), `${JSON.stringify(provenance)}\n`);
  const manifest = buildL2ArchiveManifest(root);
  writeFileSync(join(root, 'l2-archive-manifest.json'), JSON.stringify(manifest));
  return {
    policyId: 'utc-day-max-gap-v1', startDayUtc: COVERAGE_TEST_DAY, endDayUtc: COVERAGE_TEST_DAY,
    maxGapMs: 6 * 3_600_000, maxClockSkewMs: 1000, expectedUniverse: universe,
    expectedManifestSha256: manifest.manifestSha256, provenanceFilename: 'capture-provenance.jsonl',
    icApproval: { status: 'APPROVED', reference: 'local fixture only', approvedBy: 'fixture authority', approvedAtIso: COVERAGE_TEST_NOW },
    ...changes,
  };
}

export function coverageBytes(root: string, path = 'wal/segment_0001.wal'): Buffer {
  return readFileSync(join(root, path));
}
