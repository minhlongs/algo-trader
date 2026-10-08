/**
 * Zero-Copy Binary Market Data Frame Parser
 * Extracts symbol, price, quantity, and side directly from raw binary buffers with zero heap allocations.
 *
 * @module desk/hardware/zero-copy-parser
 */

import { MarketTickPacket } from './hardware-types';

export class ZeroCopyParser {
  // Protocol binary layout:
  // Offset 0 (2 bytes): streamId (uint16)
  // Offset 2 (4 bytes): sequenceNumber (uint32)
  // Offset 6 (2 bytes): symbolCode (uint16)
  // Offset 8 (8 bytes): priceScaled (bigint64)
  // Offset 16 (8 bytes): quantityScaled (bigint64)
  // Offset 24 (1 byte): side (1 = BID, 2 = ASK)
  public static readonly FRAME_LENGTH_BYTES = 25;

  public parseFrame(buffer: Uint8Array, offset = 0, ingressTimestampNs = 0n): MarketTickPacket | undefined {
    if (buffer.length - offset < ZeroCopyParser.FRAME_LENGTH_BYTES) {
      return undefined;
    }

    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, ZeroCopyParser.FRAME_LENGTH_BYTES);
    const streamId = view.getUint16(0, false);
    const sequenceNumber = view.getUint32(2, false);
    const symbolCode = view.getUint16(6, false);
    const priceScaled = view.getBigInt64(8, false);
    const quantityScaled = view.getBigInt64(16, false);
    const sideByte = view.getUint8(24);

    return {
      streamId,
      sequenceNumber,
      symbolCode,
      priceScaled,
      quantityScaled,
      side: sideByte === 1 ? 'BID' : 'ASK',
      ingressTimestampNs,
    };
  }

  public serializeFrame(tick: MarketTickPacket): Uint8Array {
    const buffer = new Uint8Array(ZeroCopyParser.FRAME_LENGTH_BYTES);
    const view = new DataView(buffer.buffer, buffer.byteOffset, ZeroCopyParser.FRAME_LENGTH_BYTES);

    view.setUint16(0, tick.streamId, false);
    view.setUint32(2, tick.sequenceNumber, false);
    view.setUint16(6, tick.symbolCode, false);
    view.setBigInt64(8, tick.priceScaled, false);
    view.setBigInt64(16, tick.quantityScaled, false);
    view.setUint8(24, tick.side === 'BID' ? 1 : 2);

    return buffer;
  }
}
