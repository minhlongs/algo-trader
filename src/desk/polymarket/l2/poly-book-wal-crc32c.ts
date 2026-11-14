/**
 * Pure TypeScript Castagnoli CRC32C (`0x82F63B78`) and WAL segment frame scanner
 * matching `sidecars/poly-book/crates/pb-wal/src/segment.rs`.
 *
 * Frame layout (little-endian): `[len: u32 LE (4B)][crc: u32 LE (4B)][payload: len B]`
 * where `crc = crc32c_append(crc32c(len_le_bytes), payload)`.
 */

export const WAL_FRAME_HEADER_BYTES = 8;
export const WAL_MAX_RECORD_BYTES = 256 * 1024 * 1024;
export const POLY_BOOK_WAL_CODEC_V3 = 3;

const CASTAGNOLI_POLY = 0x82f63b78;

const CRC32C_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ CASTAGNOLI_POLY : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

export function crc32cAppend(initialCrc: number, data: Uint8Array): number {
  let crc = (initialCrc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC32C_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function crc32c(data: Uint8Array): number {
  return crc32cAppend(0, data);
}

/** Matches `pb_wal::segment::frame_crc(len, payload)`. */
export function polyBookFrameCrc(len: number, payload: Uint8Array): number {
  const lenBytes = new Uint8Array(4);
  new DataView(lenBytes.buffer).setUint32(0, len >>> 0, true);
  return crc32cAppend(crc32c(lenBytes), payload);
}

export type PolyBookWalCorruptionReason =
  | 'crc_mismatch'
  | 'unsupported_version'
  | 'record_too_large'
  | 'truncated_mid_segment'
  | 'codec_error';

export interface PolyBookWalCorruptionDetails {
  segmentId: number;
  offset: number;
  reason: PolyBookWalCorruptionReason;
  expectedCrc?: number;
  actualCrc?: number;
  codecVersion?: number;
}

export class PolyBookWalCorruptionError extends Error {
  readonly segmentId: number;
  readonly offset: number;
  readonly reason: PolyBookWalCorruptionReason;
  readonly expectedCrc?: number;
  readonly actualCrc?: number;
  readonly codecVersion?: number;

  constructor(message: string, details: PolyBookWalCorruptionDetails) {
    super(message);
    this.name = 'PolyBookWalCorruptionError';
    this.segmentId = details.segmentId;
    this.offset = details.offset;
    this.reason = details.reason;
    this.expectedCrc = details.expectedCrc;
    this.actualCrc = details.actualCrc;
    this.codecVersion = details.codecVersion;
  }
}

export interface PolyBookWalFrame {
  offset: number;
  crc: number;
  payload: Uint8Array;
}

export interface PolyBookWalScanOptions {
  /** True when scanning the latest active segment, allowing torn crash tails. */
  isLastSegment?: boolean;
}

export interface PolyBookWalScanResult {
  frames: PolyBookWalFrame[];
  validEndOffset: number;
  tornTailBytes: number;
}

function isAllZeroFrom(data: Uint8Array, start: number): boolean {
  for (let i = start; i < data.length; i++) {
    if (data[i] !== 0) return false;
  }
  return true;
}

export function encodePolyBookWalFrame(payload: Uint8Array): Uint8Array {
  if (payload.length > WAL_MAX_RECORD_BYTES) {
    throw new PolyBookWalCorruptionError(`Record payload ${payload.length} exceeds max`, {
      segmentId: 0,
      offset: 0,
      reason: 'record_too_large',
    });
  }
  const out = new Uint8Array(WAL_FRAME_HEADER_BYTES + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.length, true);
  view.setUint32(4, polyBookFrameCrc(payload.length, payload), true);
  out.set(payload, WAL_FRAME_HEADER_BYTES);
  return out;
}

export function scanPolyBookWalFrames(
  data: Uint8Array,
  segmentId: number,
  options: PolyBookWalScanOptions = {},
): PolyBookWalScanResult {
  const isLastSegment = options.isLastSegment ?? true;
  const frames: PolyBookWalFrame[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset < data.length) {
    if (offset + WAL_FRAME_HEADER_BYTES > data.length) {
      if (isLastSegment) {
        return { frames, validEndOffset: offset, tornTailBytes: data.length - offset };
      }
      throw new PolyBookWalCorruptionError(
        `Truncated WAL header in closed segment ${segmentId} at offset ${offset}`,
        { segmentId, offset, reason: 'truncated_mid_segment' },
      );
    }

    const len = view.getUint32(offset, true);
    const storedCrc = view.getUint32(offset + 4, true);

    if (len === 0) {
      if (storedCrc === 0 && isAllZeroFrom(data, offset)) {
        return { frames, validEndOffset: offset, tornTailBytes: 0 };
      }
      throw new PolyBookWalCorruptionError(
        `Zero-length frame followed by non-zero bytes in segment ${segmentId} at offset ${offset}`,
        { segmentId, offset, reason: 'truncated_mid_segment' },
      );
    }

    if (len > WAL_MAX_RECORD_BYTES) {
      throw new PolyBookWalCorruptionError(
        `WAL frame length ${len} exceeds max ${WAL_MAX_RECORD_BYTES} in segment ${segmentId}`,
        { segmentId, offset, reason: 'record_too_large' },
      );
    }

    const payloadStart = offset + WAL_FRAME_HEADER_BYTES;
    const payloadEnd = payloadStart + len;
    if (payloadEnd > data.length) {
      if (isLastSegment) {
        return { frames, validEndOffset: offset, tornTailBytes: data.length - offset };
      }
      throw new PolyBookWalCorruptionError(
        `Truncated WAL payload in closed segment ${segmentId} at offset ${offset}`,
        { segmentId, offset, reason: 'truncated_mid_segment' },
      );
    }

    const payload = data.subarray(payloadStart, payloadEnd);
    const actualCrc = polyBookFrameCrc(len, payload);
    if (storedCrc !== actualCrc) {
      throw new PolyBookWalCorruptionError(
        `WAL CRC32C mismatch in segment ${segmentId} at offset ${offset}: expected 0x${storedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`,
        { segmentId, offset, reason: 'crc_mismatch', expectedCrc: storedCrc, actualCrc },
      );
    }

    const version = payload[0]!;
    if (version !== POLY_BOOK_WAL_CODEC_V3) {
      const hint = version === 1 || version === 2 ? '; drain the WAL before upgrading' : '';
      throw new PolyBookWalCorruptionError(
        `Unsupported WAL codec version ${version} in segment ${segmentId} at offset ${offset}${hint}`,
        { segmentId, offset, reason: 'unsupported_version', codecVersion: version },
      );
    }

    frames.push({ offset, crc: storedCrc, payload });
    offset = payloadEnd;
  }

  return { frames, validEndOffset: offset, tornTailBytes: 0 };
}
