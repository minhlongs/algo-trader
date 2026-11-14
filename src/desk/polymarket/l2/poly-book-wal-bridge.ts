/**
 * `poly-book` WAL v3 directory reader, continuity analyzer, and L2 replay bridge.
 * Scans `segment_*.wal` files by segment ID, verifies Castagnoli CRC32C frames,
 * decodes `PersistedRecord` v3 payloads, and folds `Checkpoint` + `BookEvent`
 * (`Snapshot` / `Delta`) into `RecordedL2Row[]` and `ReplayedBookStep[]`.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { L2PriceLevel, RecordedL2Row } from './l2-event-types';
import { replayRows, type ReplayedBookStep } from './l2-replay';
import { L2_SOURCE_POLY_BOOK_WAL } from './l2-source-labels';
import { decodePolyBookWalRecord, type PolyBookEventProvenance, type PolyBookPersistedRecord } from './poly-book-wal-codec';
import { PolyBookWalCorruptionError, WAL_FRAME_HEADER_BYTES, scanPolyBookWalFrames } from './poly-book-wal-crc32c';

export type PolyBookOrderingMode = 'recv_time' | 'exchange_time';

export interface PolyBookContinuityReport {
  validFrames: number;
  corruptFrames: number;
  sequenceGaps: number;
  bookMismatches: number;
  sourceResets: number;
  assetsSeen: string[];
}

export interface PolyBookWalBridgeOptions {
  mode?: PolyBookOrderingMode;
  assetId?: string;
  onCorruption?: 'throw' | 'skip';
}

export interface PolyBookWalReplayResult {
  records: PolyBookPersistedRecord[];
  rows: RecordedL2Row[];
  steps: ReplayedBookStep[];
  continuity: PolyBookContinuityReport;
}

const SEGMENT_FILE_RE = /^segment_(\d+)\.wal$/;

export async function listPolyBookWalSegments(walDir: string): Promise<Array<{ id: number; path: string }>> {
  const segments: Array<{ id: number; path: string }> = [];
  for (const name of await readdir(walDir)) {
    const match = SEGMENT_FILE_RE.exec(name);
    if (match && Number.isSafeInteger(Number(match[1]))) {
      segments.push({ id: Number(match[1]), path: join(walDir, name) });
    }
  }
  return segments.sort((a, b) => a.id - b.id);
}

type TimelineItem =
  | { kind: 'book'; rec: Extract<PolyBookPersistedRecord, { tag: 'Book' }>; primaryUs: number; secondaryUs: number; idx: number }
  | { kind: 'checkpoint'; rec: Extract<PolyBookPersistedRecord, { tag: 'Checkpoint' }>; primaryUs: number; secondaryUs: number; idx: number }
  | { kind: 'reset'; assetId?: string; primaryUs: number; secondaryUs: number; idx: number };

function compareTimeline(a: TimelineItem, b: TimelineItem): number {
  if (a.primaryUs !== b.primaryUs) return a.primaryUs - b.primaryUs;
  if (a.secondaryUs !== b.secondaryUs) return a.secondaryUs - b.secondaryUs;
  const ordA = a.kind !== 'reset' ? (a.rec.provenance.ingestOrdinal ?? Number.MAX_SAFE_INTEGER) : -1;
  const ordB = b.kind !== 'reset' ? (b.rec.provenance.ingestOrdinal ?? Number.MAX_SAFE_INTEGER) : -1;
  if (ordA !== ordB) return ordA - ordB;
  const seqA = a.kind !== 'reset' ? (a.rec.provenance.sequence ?? 0) : 0;
  const seqB = b.kind !== 'reset' ? (b.rec.provenance.sequence ?? 0) : 0;
  return seqA !== seqB ? seqA - seqB : a.idx - b.idx;
}

function buildRow(
  primaryUs: number, assetId: string, eventType: 'book' | 'price_change',
  bids: L2PriceLevel[], asks: L2PriceLevel[], prov: PolyBookEventProvenance, exchFallbackUs?: number,
): RecordedL2Row {
  return {
    t: Math.floor(primaryUs / 1000), source: L2_SOURCE_POLY_BOOK_WAL, assetId, eventType, bids, asks,
    ...(prov.sourceEventId ? { hash: prov.sourceEventId } : {}),
    recvTimestampUs: prov.recvTimestampUs,
    exchangeTimestampUs: prov.exchangeTimestampUs || exchFallbackUs || prov.exchangeTimestampUs,
    ...(prov.sequence !== undefined ? { sequence: prov.sequence } : {}),
    ...(prov.ingestOrdinal !== undefined ? { ingestOrdinal: prov.ingestOrdinal } : {}),
  };
}

export function replayPolyBookWalRecords(
  records: readonly PolyBookPersistedRecord[],
  options: PolyBookWalBridgeOptions = {},
  corruptFrames = 0,
): PolyBookWalReplayResult {
  const mode: PolyBookOrderingMode = options.mode ?? 'recv_time';
  const assets = new Set<string>(), explicitGapKeys = new Set<string>();
  let sequenceGaps = 0, bookMismatches = 0, sourceResets = 0;
  const timeline: TimelineItem[] = [];

  records.forEach((rec, idx) => {
    if (rec.tag !== 'Ingest') assets.add(rec.assetId);
    else if (rec.assetId) assets.add(rec.assetId);
    if (rec.tag === 'Ingest') {
      if (rec.kind === 'SequenceGap') {
        sequenceGaps += 1;
        if (rec.assetId && rec.observedSequence !== undefined) explicitGapKeys.add(`${rec.assetId}:${rec.observedSequence}`);
      } else if (rec.kind === 'BookMismatch') bookMismatches += 1;
      else if (rec.kind === 'SourceReset') {
        sourceResets += 1;
        const exchUs = rec.provenance.exchangeTimestampUs || rec.provenance.recvTimestampUs;
        timeline.push({ kind: 'reset', assetId: rec.assetId, primaryUs: mode === 'recv_time' ? rec.provenance.recvTimestampUs : exchUs, secondaryUs: rec.provenance.recvTimestampUs, idx });
      }
      return;
    }
    if (options.assetId !== undefined && rec.assetId !== options.assetId) return;
    if (rec.tag === 'Book' || rec.tag === 'Checkpoint') {
      const exchUs = rec.provenance.exchangeTimestampUs || (rec.tag === 'Checkpoint' ? rec.checkpointTimestampUs : rec.provenance.recvTimestampUs);
      const primaryUs = mode === 'recv_time' ? rec.provenance.recvTimestampUs : exchUs;
      const secondaryUs = mode === 'recv_time' ? 0 : rec.provenance.recvTimestampUs;
      timeline.push(rec.tag === 'Book' ? { kind: 'book', rec, idx, primaryUs, secondaryUs } : { kind: 'checkpoint', rec, idx, primaryUs, secondaryUs });
    }
  });

  timeline.sort(compareTimeline);
  const rows: RecordedL2Row[] = [], steps: ReplayedBookStep[] = [], seqByAsset = new Map<string, number>();
  let segmentRows: RecordedL2Row[] = [];

  const flushSegment = (resetAsset?: string): void => {
    if (segmentRows.length === 0) return;
    if (resetAsset === undefined) { steps.push(...replayRows(segmentRows)); segmentRows = []; seqByAsset.clear(); return; }
    const matching = segmentRows.filter((r) => r.assetId === resetAsset);
    if (matching.length > 0) steps.push(...replayRows(matching));
    segmentRows = segmentRows.filter((r) => r.assetId !== resetAsset);
    seqByAsset.delete(resetAsset);
  };

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i]!;
    if (item.kind === 'reset') { flushSegment(item.assetId); continue; }
    if (item.kind === 'checkpoint') {
      const { rec, primaryUs } = item;
      const row = buildRow(primaryUs, rec.assetId, 'book', rec.bids.filter((l) => Number(l.size) > 0), rec.asks.filter((l) => Number(l.size) > 0), rec.provenance, rec.checkpointTimestampUs);
      seqByAsset.set(rec.assetId, rec.provenance.sequence ?? 0);
      rows.push(row); segmentRows.push(row); continue;
    }
    const { rec, primaryUs } = item;
    if (rec.kind === 'Snapshot') {
      const bids: L2PriceLevel[] = [], asks: L2PriceLevel[] = [];
      let lastProv = rec.provenance, j = i;
      while (j < timeline.length) {
        const next = timeline[j]!;
        if (next.kind !== 'book' || next.rec.kind !== 'Snapshot' || next.rec.assetId !== rec.assetId || next.primaryUs !== primaryUs) break;
        if (next.rec.sizeRaw > 0n) (next.rec.side === 'Bid' ? bids : asks).push({ price: next.rec.price, size: next.rec.size });
        lastProv = next.rec.provenance; j += 1;
      }
      i = j - 1; seqByAsset.set(rec.assetId, lastProv.sequence ?? 0);
      const row = buildRow(primaryUs, rec.assetId, 'book', bids, asks, lastProv);
      rows.push(row); segmentRows.push(row);
    } else {
      const prevSeq = seqByAsset.get(rec.assetId);
      if (prevSeq !== undefined && rec.provenance.sequence !== undefined && rec.provenance.sequence !== prevSeq + 1 && !explicitGapKeys.has(`${rec.assetId}:${rec.provenance.sequence}`)) sequenceGaps += 1;
      if (rec.provenance.sequence !== undefined) seqByAsset.set(rec.assetId, rec.provenance.sequence);
      const level: L2PriceLevel = { price: rec.price, size: rec.size };
      const row = buildRow(primaryUs, rec.assetId, 'price_change', rec.side === 'Bid' ? [level] : [], rec.side === 'Ask' ? [level] : [], rec.provenance);
      rows.push(row); segmentRows.push(row);
    }
  }
  flushSegment(); steps.sort((a, b) => a.t - b.t);
  return { records: [...records], rows, steps, continuity: { validFrames: records.length, corruptFrames, sequenceGaps, bookMismatches, sourceResets, assetsSeen: [...assets].sort() } };
}

export async function readPolyBookWalDirectory(walDir: string, options: PolyBookWalBridgeOptions = {}): Promise<PolyBookWalReplayResult> {
  const segments = await listPolyBookWalSegments(walDir);
  const records: PolyBookPersistedRecord[] = [];
  let corruptFrames = 0;
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx]!, isLast = idx === segments.length - 1;
    const data = new Uint8Array(await readFile(seg.path));
    if (options.onCorruption === 'skip') {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let off = 0, cleanZeroTail = false;
      while (off + WAL_FRAME_HEADER_BYTES <= data.length) {
        const len = view.getUint32(off, true);
        if (len === 0) {
          cleanZeroTail = view.getUint32(off + 4, true) === 0 && data.subarray(off).every((b) => b === 0);
          if (!cleanZeroTail) corruptFrames += 1;
          off = data.length;
          break;
        }
        const end = off + WAL_FRAME_HEADER_BYTES + len;
        if (end > data.length) { if (!isLast) corruptFrames += 1; off = data.length; break; }
        try { records.push(decodePolyBookWalRecord(scanPolyBookWalFrames(data.subarray(off, end), seg.id, { isLastSegment: false }).frames[0]!.payload, seg.id, off)); }
        catch (e) { if (e instanceof PolyBookWalCorruptionError) corruptFrames += 1; else throw e; }
        off = end;
      }
      if (off < data.length && !isLast && !data.subarray(off).every((b) => b === 0)) corruptFrames += 1;
    } else {
      for (const frame of scanPolyBookWalFrames(data, seg.id, { isLastSegment: isLast }).frames) {
        records.push(decodePolyBookWalRecord(frame.payload, seg.id, frame.offset));
      }
    }
  }
  return replayPolyBookWalRecords(records, options, corruptFrames);
}
