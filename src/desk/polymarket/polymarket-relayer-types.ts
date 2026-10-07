/**
 * Polymarket Relayer Types & Interfaces
 */

export type SignatureType = 0 | 1 | 2; // 0 = EOA, 1 = POLY_PROXY, 2 = POLY_GNOSIS_SAFE

export interface RelayerOrderRequest {
  tokenId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  expiration?: number;
  nonce?: string;
  feeRateBps?: number;
  signatureType?: SignatureType;
}

export interface RelayerSignedOrder extends RelayerOrderRequest {
  signature: string;
  maker: string;
  nonce: string;
  expiration: number;
  feeRateBps: number;
  signatureType: SignatureType;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface RelayerOrderResponse {
  orderId: string;
  status: 'PENDING' | 'MATCHED' | 'MINED' | 'FAILED';
  transactionHash?: string;
  latencyMs: number;
  error?: string;
}

export interface RelayerConfig {
  relayerUrl?: string;
  chainId?: number;
  verifyingContract?: string;
  fetchFn?: typeof fetch;
}

export const DEFAULT_RELAYER_URL = 'https://relayer.polymarket.com';
export const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
