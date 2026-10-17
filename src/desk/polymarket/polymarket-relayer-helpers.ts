/**
 * EIP-712 message builders, payload formatters, and response validation helpers
 * for PolymarketRelayerEngine.
 */

import { z } from 'zod';
import type {
  SignatureType,
  RelayerOrderRequest,
  RelayerSignedOrder,
  RelayerOrderResponse,
} from './polymarket-relayer-types';

export const ORDER_EIP712_TYPES = {
  Order: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
    { name: 'maxFeePerGas', type: 'uint256' },
    { name: 'maxPriorityFeePerGas', type: 'uint256' },
  ],
};

export function buildEip712Domain(chainId: number, verifyingContract: string) {
  return {
    name: 'Polymarket CTF Exchange',
    version: '1',
    chainId,
    verifyingContract,
  };
}

export function buildEip712OrderMessage(
  req: RelayerOrderRequest,
  nonce: string,
  expiration: number,
  feeRateBps: number,
  signatureType: SignatureType,
  maxFeePerGasStr: string,
  maxPriorityFeePerGasStr: string,
) {
  const makerAmount = Math.round(req.size * 1e6).toString();
  const takerAmount = Math.round(req.size * req.price * 1e6).toString();

  return {
    tokenId: req.tokenId,
    makerAmount,
    takerAmount,
    expiration: expiration.toString(),
    nonce,
    feeRateBps: feeRateBps.toString(),
    side: req.side === 'BUY' ? 0 : 1,
    signatureType,
    maxFeePerGas: maxFeePerGasStr,
    maxPriorityFeePerGas: maxPriorityFeePerGasStr,
  };
}

export function buildRelayerSubmitPayload(order: RelayerSignedOrder) {
  return {
    order: {
      tokenId: order.tokenId,
      maker: order.maker,
      price: order.price,
      size: order.size,
      side: order.side,
      expiration: order.expiration,
      nonce: order.nonce,
      feeRateBps: order.feeRateBps,
      signatureType: order.signatureType,
      signature: order.signature,
      maxFeePerGas: order.maxFeePerGas,
      maxPriorityFeePerGas: order.maxPriorityFeePerGas,
    },
  };
}

const relayerSubmitResponseSchema = z.object({
  orderId: z.string().optional(),
  status: z.string().optional(),
  transactionHash: z.string().optional(),
});

export function parseRelayerSubmitResponse(
  data: unknown,
  latencyMs: number,
): RelayerOrderResponse {
  const parsedData = relayerSubmitResponseSchema.parse(data);
  return {
    orderId: parsedData.orderId ?? `relayer-${Date.now()}`,
    status: (parsedData.status as RelayerOrderResponse['status']) ?? 'PENDING',
    transactionHash: parsedData.transactionHash,
    latencyMs,
  };
}
