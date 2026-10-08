/**
 * FIX 4.4 / 5.0 Protocol Engine
 * Standard institutional Tag=Value parser, serializer, and checksum validator (SOH delimiter \x01).
 *
 * @module desk/settlement/fix-protocol-engine
 */

import { FixMessage, FixField } from './settlement-types';

export class FixProtocolEngine {
  public static readonly SOH = '\x01';

  /**
   * Serializes a structured message into standard SOH-delimited FIX 4.4 wire string.
   */
  public static serialize(msg: FixMessage): string {
    const bodyFields: FixField[] = [
      { tag: 35, value: msg.msgType },
      { tag: 49, value: msg.senderCompId },
      { tag: 56, value: msg.targetCompId },
      { tag: 34, value: msg.msgSeqNum.toString() },
      { tag: 52, value: msg.sendingTime },
      ...msg.fields,
    ];

    const bodyStr = bodyFields.map(f => `${f.tag}=${f.value}`).join(this.SOH) + this.SOH;
    const bodyLength = bodyStr.length;
    const headerStr = `8=FIX.4.4${this.SOH}9=${bodyLength}${this.SOH}`;
    const partialMsg = headerStr + bodyStr;

    // Calculate checksum mod 256
    let sum = 0;
    for (let i = 0; i < partialMsg.length; i++) {
      sum += partialMsg.charCodeAt(i);
    }
    const checksum = (sum % 256).toString().padStart(3, '0');

    return `${partialMsg}10=${checksum}${this.SOH}`;
  }

  /**
   * Parses an incoming raw FIX string and verifies the checksum.
   */
  public static parse(rawFix: string): FixMessage {
    const rawParts = rawFix.split(this.SOH).filter(part => part.length > 0);
    if (rawParts.length < 5) {
      throw new Error('Invalid FIX message format: insufficient tags');
    }

    const fieldMap = new Map<number, string>();
    const fields: FixField[] = [];

    for (const part of rawParts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const tag = parseInt(part.substring(0, eqIdx), 10);
      const val = part.substring(eqIdx + 1);
      fieldMap.set(tag, val);
      if (![8, 9, 10, 35, 49, 56, 34, 52].includes(tag)) {
        fields.push({ tag, value: val });
      }
    }

    // Validate Checksum (Tag 10)
    const expectedChecksum = fieldMap.get(10);
    if (!expectedChecksum) {
      throw new Error('Missing Checksum (Tag 10)');
    }

    const lastTagIdx = rawFix.indexOf(`10=${expectedChecksum}`);
    const checksumPayload = rawFix.substring(0, lastTagIdx);
    let sum = 0;
    for (let i = 0; i < checksumPayload.length; i++) {
      sum += checksumPayload.charCodeAt(i);
    }
    const computedChecksum = (sum % 256).toString().padStart(3, '0');
    if (computedChecksum !== expectedChecksum) {
      throw new Error(`Checksum mismatch: expected ${expectedChecksum}, computed ${computedChecksum}`);
    }

    return {
      msgType: fieldMap.get(35) || '',
      senderCompId: fieldMap.get(49) || '',
      targetCompId: fieldMap.get(56) || '',
      msgSeqNum: parseInt(fieldMap.get(34) || '0', 10),
      sendingTime: fieldMap.get(52) || '',
      fields,
    };
  }
}
