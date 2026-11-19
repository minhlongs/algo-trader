import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { L2CoverageDayStatus, L2CoveragePolicy, L2CoverageProvenance } from './l2-coverage-policy';
import { policyUtcBounds, UTC_DAY_MS } from './l2-coverage-policy';
import { decodePolyBookWalRecord, type PolyBookPersistedRecord } from './poly-book-wal-codec';
import { scanPolyBookWalFrames } from './poly-book-wal-crc32c';

export class L2CoverageValidationError extends Error {
  constructor(readonly status: L2CoverageDayStatus, message: string) {
    super(message);
    this.name = 'L2CoverageValidationError';
  }
}
export interface L2CoverageObservation {
  readonly tokenId: string;
  readonly recvMs: number;
  readonly exchangeMs: number;
  readonly sequence: number;
  readonly session: string;
  readonly snapshot: boolean;
}
export interface L2CoverageWalData {
  readonly observations: L2CoverageObservation[];
  readonly interruptions: number[];
  readonly frameDays: Set<number>;
  readonly hasWalSegments: boolean;
}
const syntheticMarker = /TEST[_-]ONLY|synthetic/i;
export const isSyntheticCoverageLabel = (value: string): boolean => syntheticMarker.test(value);
const utcDayStart = (epochMs: number): number => Math.floor(epochMs / UTC_DAY_MS) * UTC_DAY_MS;
const invalid = (message: string): never => { throw new L2CoverageValidationError('INVALID', message); };

function recordValidator(policy: L2CoveragePolicy, data: L2CoverageWalData) {
  const { startMs, endMs } = policyUtcBounds(policy);
  const maxSkewUs = policy.maxClockSkewMs * 1000;
  const tokens = new Set(policy.expectedUniverse.flatMap((market) => market.tokenIds));
  const inRange = (timestampUs: number): boolean => timestampUs > 0 &&
    timestampUs / 1000 >= startMs && timestampUs / 1000 < endMs;
  const sameDay = (a: number, b: number): boolean =>
    Math.floor(a / (UTC_DAY_MS * 1000)) === Math.floor(b / (UTC_DAY_MS * 1000));
  return (record: PolyBookPersistedRecord, sessions: ReadonlySet<string>): void => {
    if (record.assetId !== undefined && !tokens.has(record.assetId)) invalid(`UNIVERSE unexpected token ${record.assetId}`);
    if (record.tag === 'Validation') {
      if (![record.replayTimestampUs, record.referenceTimestampUs, record.persistedAtUs].every(inRange)) {
        invalid('TIMESTAMP invalid validation timestamp');
      }
      data.frameDays.add(utcDayStart(record.replayTimestampUs / 1000));
      if (!record.matched) data.interruptions.push(record.replayTimestampUs / 1000, record.referenceTimestampUs / 1000);
      return;
    }
    const { recvTimestampUs, exchangeTimestampUs, source, sourceEventId, sourceSessionId, sequence } = record.provenance;
    if ([sourceEventId, sourceSessionId, record.tag === 'Ingest' ? record.details : undefined]
      .some((value) => value !== undefined && syntheticMarker.test(value))) {
      throw new L2CoverageValidationError('SYNTHETIC', 'TEST_ONLY/synthetic WAL provenance excluded');
    }
    if (!inRange(recvTimestampUs) ||
        (!(record.tag === 'Ingest' && exchangeTimestampUs === 0) &&
          (!inRange(exchangeTimestampUs) || Math.abs(recvTimestampUs - exchangeTimestampUs) > maxSkewUs))) {
      invalid('TIMESTAMP receive/exchange timestamp is invalid, outside UTC range, or exceeds clock skew');
    }
    data.frameDays.add(utcDayStart(recvTimestampUs / 1000));
    if (record.tag === 'Ingest') {
      data.interruptions.push(recvTimestampUs / 1000);
      return;
    }
    if (source !== 'WebSocket' && source !== 'RestSnapshot') {
      throw new L2CoverageValidationError('SYNTHETIC', 'Non-market WAL source excluded');
    }
    // Sidecar REST checkpoints do not carry a WS session or sequence. They never fill WS coverage gaps.
    if (record.tag === 'Checkpoint') {
      if (!inRange(record.checkpointTimestampUs) || Math.abs(record.checkpointTimestampUs - recvTimestampUs) > maxSkewUs) {
        invalid('TIMESTAMP invalid checkpoint timestamp');
      }
      return;
    }
    if (!sourceSessionId || !sessions.has(sourceSessionId)) return invalid('PROVENANCE WAL session is absent from verified capture provenance');
    if (record.tag === 'Trade' || source !== 'WebSocket') return;
    if (sequence === undefined) return invalid('SEQUENCE missing book sequence');
    if (!sameDay(recvTimestampUs, exchangeTimestampUs)) return invalid('TIMESTAMP book clocks fall in different UTC days');
    if (record.kind === 'Snapshot' && record.sizeRaw === 0n) return invalid('BOOK zero-size snapshot');
    data.observations.push({
      tokenId: record.assetId, recvMs: recvTimestampUs / 1000, exchangeMs: exchangeTimestampUs / 1000,
      sequence, session: sourceSessionId, snapshot: record.kind === 'Snapshot',
    });
  };
}

export function readL2CoverageWal(
  root: string,
  files: L2CoverageProvenance['files'],
  policy: L2CoveragePolicy,
): L2CoverageWalData {
  const data: L2CoverageWalData = { observations: [], interruptions: [], frameDays: new Set(), hasWalSegments: files.length > 0 };
  const validateRecord = recordValidator(policy, data);
  const fileDigests = new Set<string>();
  for (const file of [...files].sort((a, b) => a.relativePath < b.relativePath ? -1 : 1)) {
    if (syntheticMarker.test(file.relativePath) || file.sourceSessionIds.some((id) => syntheticMarker.test(id))) {
      throw new L2CoverageValidationError('SYNTHETIC', 'TEST_ONLY/synthetic archive excluded');
    }
    // No synchronous Parquet row decoder exists here; magic bytes/metadata are not row validation.
    if (!file.relativePath.toLowerCase().endsWith('.wal')) invalid(`UNSUPPORTED_FORMAT ${file.relativePath}; only CRC-verified WAL v3 is supported`);
    const path = join(root, file.relativePath);
    if (lstatSync(path).isSymbolicLink()) invalid('PROVENANCE symbolic-link WAL rejected');
    const bytes = readFileSync(path);
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) invalid('PROVENANCE WAL digest changed after manifest verification');
    if (bytes.length === 0) continue;
    if (fileDigests.has(file.sha256)) invalid('DUPLICATE WAL segment cannot supply additional coverage');
    fileDigests.add(file.sha256);
    // Archives are closed evidence, unlike an active reader: torn final frames are never tolerated.
    const scan = scanPolyBookWalFrames(bytes, 0, { isLastSegment: false });
    const sessions = new Set(file.sourceSessionIds);
    const lastTime = new Map<string, number>();
    for (const frame of scan.frames) {
      const record = decodePolyBookWalRecord(frame.payload, 0, frame.offset);
      if (record.tag === 'Book' && record.provenance.source === 'WebSocket') {
        const timestamp = record.provenance.recvTimestampUs;
        if (timestamp < (lastTime.get(record.assetId) ?? 0)) invalid('TIMESTAMP non-monotonic WAL receive time');
        lastTime.set(record.assetId, timestamp);
      }
      validateRecord(record, sessions);
    }
  }
  return data;
}
