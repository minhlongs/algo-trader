import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectL2ArchiveCoverage } from '../../../src/desk/polymarket/l2/l2-archive-coverage';
import type { L2CoveragePolicy } from '../../../src/desk/polymarket/l2/l2-coverage-policy';
import type { PolyBookPersistedRecord } from '../../../src/desk/polymarket/l2/poly-book-wal-codec';
import { COVERAGE_TEST_NOW, COVERAGE_TEST_SESSION, coverageBookRecords, coverageBytes, sealCoverageFixture, writeCoverageWal } from './l2-coverage-fixtures';

describe('L2 archive coverage', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'l2-archive-coverage-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function inspect(policy: L2CoveragePolicy, generatedAtIso = COVERAGE_TEST_NOW) {
    const errors: string[] = [];
    return { ...inspectL2ArchiveCoverage({ rootDir: root, manifestFilename: 'l2-archive-manifest.json', policy, generatedAtIso }, errors), errors };
  }

  it('requires full UTC-day coverage for every token and reports absent days deterministically', () => {
    writeCoverageWal(root, [...coverageBookRecords(), ...coverageBookRecords('2026-11-18', 'token-no')], 'wal/1900-01-01.wal');
    const expectedUniverse = [{ marketId: 'market-a', tokenIds: ['token-no', 'token-yes'] }];
    const policy = sealCoverageFixture(root, { expectedUniverse, startDayUtc: '2026-11-17' }, (p) => {
      p.universe[0]!.tokenIds.push('token-no');
    });
    expect(inspect(policy)).toMatchObject({ recordedL2Days: 1, manifestOk: true, days: [
      { dayUtc: '2026-11-17', status: 'MISSING', validBookFrames: 0 },
      { dayUtc: '2026-11-18', status: 'QUALIFIED', validBookFrames: 10 },
    ] });
    expect(inspect(policy)).toEqual(inspect(policy));
  });

  it('recognizes a real sequence reset at a new snapshot without hiding a preceding sequence gap', () => {
    const books = coverageBookRecords();
    const [a, b, c, d, e] = books as Extract<PolyBookPersistedRecord, { tag: 'Book' }>[];
    const snapshot = { ...c!, kind: 'Snapshot' as const, provenance: { ...c!.provenance, sequence: 0 } };
    const secondRun = [snapshot, { ...d!, provenance: { ...d!.provenance, sequence: 1 } }, { ...e!, provenance: { ...e!.provenance, sequence: 2 } }];
    writeCoverageWal(root, [a!, b!, ...secondRun]);
    expect(inspect(sealCoverageFixture(root)).recordedL2Days).toBe(1);
    writeCoverageWal(root, [a!, { ...b!, provenance: { ...b!.provenance, sequence: 3 } }, ...secondRun]);
    expect(inspect(sealCoverageFixture(root)).days[0]).toMatchObject({ status: 'GAP' });
  });

  it.each([0, 2, 4])('detects boundary or internal gaps after removing frame %s', (missingIndex) => {
    writeCoverageWal(root, coverageBookRecords().filter((_, index) => index !== missingIndex));
    expect(inspect(sealCoverageFixture(root)).days[0]).toMatchObject({ status: 'GAP' });
  });

  it('distinguishes missing archive data from empty WAL and zero qualifying book frames', () => {
    expect(inspect(sealCoverageFixture(root)).days[0]).toMatchObject({ status: 'MISSING' });
    writeCoverageWal(root, []);
    expect(inspect(sealCoverageFixture(root)).days[0]).toMatchObject({ status: 'ZERO_FRAMES' });
    writeFileSync(join(root, 'wal', 'segment_0001.wal'), Buffer.alloc(64));
    expect(inspect(sealCoverageFixture(root)).days[0]).toMatchObject({ status: 'ZERO_FRAMES' });
    const timestampUs = Date.parse('2026-11-18T12:00:00.000Z') * 1000;
    writeCoverageWal(root, [{ tag: 'Ingest', kind: 'ReconnectSuccess', provenance: {
      recvTimestampUs: timestampUs, exchangeTimestampUs: 0, source: 'WebSocket', sourceSessionId: COVERAGE_TEST_SESSION,
    } }]);
    expect(inspect(sealCoverageFixture(root)).days[0]).toMatchObject({ status: 'ZERO_FRAMES' });
  });

  it('does not let reconnect markers or a fresh snapshot bridge a known outage', () => {
    const books = coverageBookRecords();
    writeCoverageWal(root, [...books, { tag: 'Ingest', kind: 'SourceReset', provenance: {
      recvTimestampUs: Date.parse('2026-11-18T11:00:00.000Z') * 1000,
      exchangeTimestampUs: 0, source: 'WebSocket', sourceSessionId: COVERAGE_TEST_SESSION,
    } }]);
    expect(inspect(sealCoverageFixture(root)).days[0]).toMatchObject({ status: 'GAP' });
  });

  it.each(['crc', 'torn', 'codec'])('rejects %s corruption even with a freshly verified manifest', (damage) => {
    writeCoverageWal(root, coverageBookRecords());
    let bytes = coverageBytes(root);
    if (damage === 'crc') bytes[20] = bytes[20]! ^ 1;
    else if (damage === 'torn') bytes = bytes.subarray(0, bytes.length - 1);
    else bytes = Buffer.from('not a WAL record');
    writeFileSync(join(root, 'wal', 'segment_0001.wal'), bytes);
    expect(inspect(sealCoverageFixture(root))).toMatchObject({ manifestOk: true, recordedL2Days: 0, days: [{ status: 'INVALID' }] });
  });

  it.each([Buffer.alloc(0), Buffer.from('PAR1-magic-only-PAR1')])('rejects Parquet without format and row validation', (bytes) => {
    writeFileSync(join(root, '2026-11-18.parquet'), bytes);
    expect(inspect(sealCoverageFixture(root))).toMatchObject({ recordedL2Days: 0, errors: [expect.stringContaining('UNSUPPORTED_FORMAT')] });
  });

  it.each(['TEST_ONLY', 'synthetic'] as const)('excludes %s provenance despite valid WAL frames', (kind) => {
    writeCoverageWal(root, coverageBookRecords());
    expect(inspect(sealCoverageFixture(root, {}, (p) => { p.dataKind = kind; })).days[0]).toMatchObject({ status: 'SYNTHETIC' });
    writeCoverageWal(root, []);
    writeCoverageWal(root, coverageBookRecords(), `wal/${kind}/segment_01.wal`);
    expect(inspect(sealCoverageFixture(root)).days[0]).toMatchObject({ status: 'SYNTHETIC' });
  });

  it('rejects out-of-window timestamps and unapproved sessions', () => {
    const books = coverageBookRecords();
    const first = books[0] as Extract<PolyBookPersistedRecord, { tag: 'Book' }>;
    writeCoverageWal(root, [{ ...first, provenance: { ...first.provenance, recvTimestampUs: 0 } }, ...books.slice(1)]);
    expect(inspect(sealCoverageFixture(root)).errors).toEqual([expect.stringContaining('TIMESTAMP')]);
    writeCoverageWal(root, books);
    expect(inspect(sealCoverageFixture(root, {}, (p) => { p.files[0]!.sourceSessionIds = ['unknown']; })).errors)
      .toEqual([expect.stringContaining('PROVENANCE WAL session')]);
  });

  it('requires exact approved market/token mapping and rejects unlisted frame tokens', () => {
    writeCoverageWal(root, coverageBookRecords());
    expect(inspect(sealCoverageFixture(root, {}, (p) => { p.universe[0]!.marketId = 'other-market'; })).errors)
      .toEqual([expect.stringContaining('UNIVERSE market/token')]);
    writeCoverageWal(root, coverageBookRecords('2026-11-18', 'extra-token'));
    expect(inspect(sealCoverageFixture(root)).errors).toEqual([expect.stringContaining('UNIVERSE unexpected token')]);
  });

  it('requires a known IC-approved policy, a closed UTC day, and the trusted manifest digest', () => {
    writeCoverageWal(root, coverageBookRecords());
    const policy = sealCoverageFixture(root);
    const unapproved = { ...policy, icApproval: undefined } as unknown as L2CoveragePolicy;
    const unknown = { ...policy, policyId: 'other' } as unknown as L2CoveragePolicy;
    expect(inspect(unapproved).errors).toEqual([expect.stringContaining('POLICY')]);
    expect(inspect(unknown).errors).toEqual([expect.stringContaining('POLICY')]);
    expect(inspect(policy, '2026-11-18T23:59:59.999Z').errors).toEqual([expect.stringContaining('incomplete UTC day')]);
    expect(inspect({ ...policy, expectedManifestSha256: '0'.repeat(64) })).toMatchObject({ manifestOk: false, recordedL2Days: 0 });
  });
});
