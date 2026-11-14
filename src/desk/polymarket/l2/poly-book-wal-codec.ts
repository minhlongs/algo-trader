/**
 * Positional `bincode` v1 codec for `poly-book` WAL v3 (`PersistedRecord`).
 * Matches `sidecars/poly-book/crates/pb-wal/src/codec.rs` and `pb-types/src/{event,fixed}.rs`.
 */

import type { L2PriceLevel } from './l2-event-types';
import { POLY_BOOK_WAL_CODEC_V3, PolyBookWalCorruptionError } from './poly-book-wal-crc32c';

export const FIXED_PRICE_SCALE = 10_000;
export const FIXED_SIZE_SCALE = 1_000_000n;
export const GOLDEN_V3_HEX =
  '03000000000400000000000000746f6b3101000000000000008813000000e1f5050000000000401e18240a0600c0fd0e18240a0600000000000105000000000000006576742d3100012a00000000000000010700000000000000';

export type PolyBookSide = 'Bid' | 'Ask';
export type PolyBookDataSource = 'WebSocket' | 'RestSnapshot' | 'ReplayValidator' | 'System';
export type PolyBookIngestKind =
  | 'ReconnectStart' | 'ReconnectSuccess' | 'SequenceGap'
  | 'StaleSnapshotSkip' | 'SourceReset' | 'BookMismatch';

export interface PolyBookEventProvenance {
  recvTimestampUs: number;
  exchangeTimestampUs: number;
  source: PolyBookDataSource;
  sourceEventId?: string;
  sourceSessionId?: string;
  sequence?: number;
  ingestOrdinal?: number;
}

export type PolyBookPersistedRecord =
  | {
      tag: 'Book'; assetId: string; kind: 'Snapshot' | 'Delta'; side: PolyBookSide;
      priceRaw: number; price: string; sizeRaw: bigint; size: string;
      provenance: PolyBookEventProvenance;
    }
  | {
      tag: 'Trade'; assetId: string; priceRaw: number; price: string;
      sizeRaw?: bigint; size?: string; side?: PolyBookSide; tradeId?: string;
      fidelity: 'Partial' | 'Full'; provenance: PolyBookEventProvenance;
    }
  | {
      tag: 'Ingest'; assetId?: string; kind: PolyBookIngestKind;
      provenance: PolyBookEventProvenance; expectedSequence?: number;
      observedSequence?: number; details?: string;
    }
  | {
      tag: 'Checkpoint'; assetId: string; checkpointTimestampUs: number;
      provenance: PolyBookEventProvenance; bids: L2PriceLevel[]; asks: L2PriceLevel[];
      walOffset?: number;
    }
  | {
      tag: 'Validation'; assetId: string; mode: 'recv_time' | 'exchange_time';
      replayTimestampUs: number; referenceTimestampUs: number; matched: boolean;
      mismatchSummary?: string; persistedAtUs: number;
    };

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const UTF8_ENCODER = new TextEncoder();
const DATA_SOURCES: readonly PolyBookDataSource[] = ['WebSocket', 'RestSnapshot', 'ReplayValidator', 'System'];
const INGEST_KINDS: readonly PolyBookIngestKind[] = [
  'ReconnectStart', 'ReconnectSuccess', 'SequenceGap', 'StaleSnapshotSkip', 'SourceReset', 'BookMismatch',
];

export function formatFixedPrice(raw: number, segmentId = 0, offset = 0): string {
  if (!Number.isInteger(raw) || raw < 0 || raw > FIXED_PRICE_SCALE) {
    throw new PolyBookWalCorruptionError(`FixedPrice raw ${raw} out of [0, 10000]`, {
      segmentId, offset, reason: 'codec_error',
    });
  }
  return `${Math.floor(raw / FIXED_PRICE_SCALE)}.${String(raw % FIXED_PRICE_SCALE).padStart(4, '0')}`;
}

export function formatFixedSize(raw: bigint): string {
  return `${(raw / FIXED_SIZE_SCALE).toString()}.${(raw % FIXED_SIZE_SCALE).toString().padStart(6, '0')}`;
}

function parseScaledBigInt(text: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = text.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0').slice(0, decimals));
}

export function decodePolyBookWalRecord(data: Uint8Array, segmentId = 0, baseOffset = 0): PolyBookPersistedRecord {
  const fail = (msg: string, reason: 'codec_error' | 'unsupported_version' = 'codec_error', codecVersion?: number): never => {
    throw new PolyBookWalCorruptionError(msg, { segmentId, offset: baseOffset, reason, codecVersion });
  };
  if (data.length === 0) fail('Empty WAL record');
  const version = data[0]!;
  if (version !== POLY_BOOK_WAL_CODEC_V3) {
    const hint = version === 1 || version === 2 ? '; drain the WAL before upgrading' : '';
    fail(`Unsupported WAL codec version ${version}${hint}`, 'unsupported_version', version);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 1;
  const need = (n: number): void => { if (pos + n > data.length) fail(`Truncated bincode at +${pos}`); };
  const u8 = (): number => { need(1); return data[pos++]!; };
  const u32 = (): number => { need(4); const v = view.getUint32(pos, true); pos += 4; return v; };
  const u64Big = (): bigint => { need(8); const v = view.getBigUint64(pos, true); pos += 8; return v; };
  const u64Num = (): number => {
    const v = u64Big();
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) fail(`u64 ${v.toString()} exceeds MAX_SAFE_INTEGER`);
    return Number(v);
  };
  const bool = (): boolean => { const b = u8(); if (b > 1) fail(`Invalid bool ${b}`); return b === 1; };
  const opt = <T>(fn: () => T): T | undefined => {
    const tag = u8(); if (tag > 1) fail(`Invalid Option tag ${tag}`); return tag === 1 ? fn() : undefined;
  };
  const str = (): string => {
    const lenBig = u64Big();
    if (lenBig > BigInt(data.length - pos)) fail(`String len ${lenBig.toString()} exceeds buffer`);
    const len = Number(lenBig);
    try { const s = UTF8_DECODER.decode(data.subarray(pos, pos + len)); pos += len; return s; }
    catch { return fail('Invalid UTF-8 string'); }
  };
  const side = (): PolyBookSide => { const v = u32(); if (v > 1) fail(`Invalid Side ${v}`); return v === 0 ? 'Bid' : 'Ask'; };
  const provenance = (): PolyBookEventProvenance => {
    const recvTimestampUs = u64Num(); const exchangeTimestampUs = u64Num();
    const srcIdx = u32(); const source = DATA_SOURCES[srcIdx] ?? fail(`Invalid DataSource ${srcIdx}`);
    return { recvTimestampUs, exchangeTimestampUs, source, sourceEventId: opt(str), sourceSessionId: opt(str), sequence: opt(u64Num), ingestOrdinal: opt(u64Num) };
  };
  const levels = (): L2PriceLevel[] => {
    const countBig = u64Big();
    if (countBig > BigInt(Math.floor((data.length - pos) / 12))) fail('Invalid level Vec len');
    const out: L2PriceLevel[] = [];
    for (let i = 0; i < Number(countBig); i++) out.push({ price: formatFixedPrice(u32(), segmentId, baseOffset), size: formatFixedSize(u64Big()) });
    return out;
  };

  const variant = u32();
  let rec: PolyBookPersistedRecord;
  if (variant === 0) {
    const assetId = str(); const k = u32(); if (k > 1) fail(`Invalid BookEventKind ${k}`);
    const s = side(); const priceRaw = u32(); const sizeRaw = u64Big();
    rec = { tag: 'Book', assetId, kind: k === 0 ? 'Snapshot' : 'Delta', side: s, priceRaw, price: formatFixedPrice(priceRaw, segmentId, baseOffset), sizeRaw, size: formatFixedSize(sizeRaw), provenance: provenance() };
  } else if (variant === 1) {
    const assetId = str(); const priceRaw = u32(); const sizeRaw = opt(u64Big); const s = opt(side); const tradeId = opt(str);
    const f = u32(); if (f > 1) fail(`Invalid TradeFidelity ${f}`);
    rec = { tag: 'Trade', assetId, priceRaw, price: formatFixedPrice(priceRaw, segmentId, baseOffset), sizeRaw, size: sizeRaw !== undefined ? formatFixedSize(sizeRaw) : undefined, side: s, tradeId, fidelity: f === 0 ? 'Partial' : 'Full', provenance: provenance() };
  } else if (variant === 2) {
    const assetId = opt(str); const kIdx = u32(); const kind = INGEST_KINDS[kIdx] ?? fail(`Invalid IngestEventKind ${kIdx}`);
    rec = { tag: 'Ingest', assetId, kind, provenance: provenance(), expectedSequence: opt(u64Num), observedSequence: opt(u64Num), details: opt(str) };
  } else if (variant === 3) {
    rec = { tag: 'Checkpoint', assetId: str(), checkpointTimestampUs: u64Num(), provenance: provenance(), bids: levels(), asks: levels(), walOffset: opt(u64Num) };
  } else if (variant === 4) {
    const assetId = str(); const m = u32(); if (m > 1) fail(`Invalid ReplayMode ${m}`);
    rec = { tag: 'Validation', assetId, mode: m === 0 ? 'recv_time' : 'exchange_time', replayTimestampUs: u64Num(), referenceTimestampUs: u64Num(), matched: bool(), mismatchSummary: opt(str), persistedAtUs: u64Num() };
  } else return fail(`Invalid PersistedRecord variant ${variant}`);
  if (pos !== data.length) fail(`Trailing ${data.length - pos} bytes in WAL record`);
  return rec;
}

export function encodePolyBookWalRecord(rec: PolyBookPersistedRecord): Uint8Array {
  const bytes: number[] = [POLY_BOOK_WAL_CODEC_V3];
  const wU8 = (v: number): void => { bytes.push(v & 0xff); };
  const wU32 = (v: number): void => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); bytes.push(...b); };
  const wU64 = (v: bigint): void => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); bytes.push(...b); };
  const wStr = (s: string): void => { const b = UTF8_ENCODER.encode(s); wU64(BigInt(b.length)); bytes.push(...b); };
  const wOpt = <T>(v: T | undefined, fn: (x: T) => void): void => { if (v === undefined) wU8(0); else { wU8(1); fn(v); } };
  const wProv = (p: PolyBookEventProvenance): void => {
    wU64(BigInt(p.recvTimestampUs)); wU64(BigInt(p.exchangeTimestampUs)); wU32(DATA_SOURCES.indexOf(p.source));
    wOpt(p.sourceEventId, wStr); wOpt(p.sourceSessionId, wStr); wOpt(p.sequence, (x) => wU64(BigInt(x))); wOpt(p.ingestOrdinal, (x) => wU64(BigInt(x)));
  };
  if (rec.tag === 'Book') {
    wU32(0); wStr(rec.assetId); wU32(rec.kind === 'Snapshot' ? 0 : 1); wU32(rec.side === 'Bid' ? 0 : 1); wU32(rec.priceRaw); wU64(rec.sizeRaw); wProv(rec.provenance);
  } else if (rec.tag === 'Trade') {
    wU32(1); wStr(rec.assetId); wU32(rec.priceRaw); wOpt(rec.sizeRaw, wU64); wOpt(rec.side, (s) => wU32(s === 'Bid' ? 0 : 1)); wOpt(rec.tradeId, wStr); wU32(rec.fidelity === 'Partial' ? 0 : 1); wProv(rec.provenance);
  } else if (rec.tag === 'Ingest') {
    wU32(2); wOpt(rec.assetId, wStr); wU32(INGEST_KINDS.indexOf(rec.kind)); wProv(rec.provenance); wOpt(rec.expectedSequence, (x) => wU64(BigInt(x))); wOpt(rec.observedSequence, (x) => wU64(BigInt(x))); wOpt(rec.details, wStr);
  } else if (rec.tag === 'Checkpoint') {
    wU32(3); wStr(rec.assetId); wU64(BigInt(rec.checkpointTimestampUs)); wProv(rec.provenance);
    for (const sideLevels of [rec.bids, rec.asks]) { wU64(BigInt(sideLevels.length)); for (const l of sideLevels) { wU32(Number(parseScaledBigInt(l.price, 4))); wU64(parseScaledBigInt(l.size, 6)); } }
    wOpt(rec.walOffset, (x) => wU64(BigInt(x)));
  } else {
    wU32(4); wStr(rec.assetId); wU32(rec.mode === 'recv_time' ? 0 : 1); wU64(BigInt(rec.replayTimestampUs)); wU64(BigInt(rec.referenceTimestampUs)); wU8(rec.matched ? 1 : 0); wOpt(rec.mismatchSummary, wStr); wU64(BigInt(rec.persistedAtUs));
  }
  return Uint8Array.from(bytes);
}
