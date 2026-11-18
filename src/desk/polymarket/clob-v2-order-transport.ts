/**
 * Polymarket CLOB V2 — HTTP transport payload serializer (`orderToJsonV2` parity).
 *
 * Keeps transport-only fields (`owner`, `orderType`, `postOnly`, `deferExec`,
 * `expiration`) strictly separated from the 11-field EIP-712 signed `Order`
 * struct in `clob-v2-order-signing.ts` (#272).
 */

import type { ClobV2OrderType } from './clob-v2-venue-constants';
import type { ClobV2SignedOrder } from './clob-v2-order-signing';

export interface ClobV2TransportOptions {
  /** L2 CLOB API key owner identifier. */
  owner: string;
  orderType?: ClobV2OrderType;
  postOnly?: boolean;
  deferExec?: boolean;
}

export interface ClobV2TransportPayload {
  deferExec: boolean;
  postOnly: boolean;
  order: {
    salt: number;
    maker: string;
    signer: string;
    taker?: undefined;
    tokenId: string;
    makerAmount: string;
    takerAmount: string;
    side: 'BUY' | 'SELL';
    signatureType: number;
    timestamp: string;
    expiration: string;
    metadata: string;
    builder: string;
    signature: string;
  };
  owner: string;
  orderType: ClobV2OrderType;
}

/**
 * Serializes a signed CLOB V2 order into the exact JSON body expected by `POST /order`,
 * matching `@polymarket/clob-client-v2`'s `orderToJsonV2`.
 */
export function buildClobV2TransportPayload(
  signed: ClobV2SignedOrder,
  options: ClobV2TransportOptions,
): ClobV2TransportPayload {
  const rawSalt = signed.signedMessage.salt;
  if (!/^\d+$/.test(rawSalt) || BigInt(rawSalt) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Unsafe V2 transport salt integer: ${rawSalt}`);
  }
  const saltNumber = Number(rawSalt);
  const expirationStr = (signed.order.expiration ?? 0).toString();
  return {
    deferExec: options.deferExec ?? false,
    postOnly: options.postOnly ?? signed.order.postOnly ?? false,
    order: {
      salt: saltNumber,
      maker: signed.signedMessage.maker,
      signer: signed.signedMessage.signer,
      taker: undefined,
      tokenId: signed.signedMessage.tokenId,
      makerAmount: signed.signedMessage.makerAmount,
      takerAmount: signed.signedMessage.takerAmount,
      side: signed.signedMessage.side === 0 ? 'BUY' : 'SELL',
      signatureType: signed.signedMessage.signatureType,
      timestamp: signed.signedMessage.timestamp,
      expiration: expirationStr,
      metadata: signed.signedMessage.metadata,
      builder: signed.signedMessage.builder,
      signature: signed.signature,
    },
    owner: options.owner,
    orderType: options.orderType ?? signed.order.orderType,
  };
}
