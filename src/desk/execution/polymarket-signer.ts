/**
 * Polymarket ECDSA Order Signer — EIP-712 typed data signing on Polygon (chainId 137).
 *
 * Supports V1 (`CTF_EXCHANGE_ADDRESS`, legacy default) and V2/V3 (`EXCHANGE_V3_ADDRESS`,
 * `PUSD_COLLATERAL_ADDRESS`, `positionId` escrow, and `signatureType: 3` polyProxy).
 */

import { ethers } from 'ethers';
import { assertPositionIdUsable } from './polymarket-v3-position-id-guard';

/** Polymarket CLOB order (unsigned) */
export interface PolymarketOrder {
  tokenId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  expiration: number;
  nonce: string;
  feeRateBps: number;
  /** 0 = EOA, 1 = POLY_PROXY, 2 = POLY_GNOSIS_SAFE, 3 = POLY_PROXY_WALLET (V2/V3 only) */
  signatureType: 0 | 1 | 2 | 3;
  /** Optional time-in-force carried into pre-trade risk and execution gates. */
  orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  /** Order protocol generation: `1` = legacy CLOB domain, `3` = CLOB V2/V3 domain. */
  protocolVersion?: '1' | '3';
  /** V2/V3 only: ERC-1155 position id of the outcome token being traded. */
  positionId?: string;
}

/** Signed order ready for submission to CLOB API */
export interface SignedOrder extends PolymarketOrder {
  signature: string;
  maker: string;
}

/** EIP-712 domain separator for Polymarket CTF Exchange */
export interface TypedDataDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface TypedDataField {
  name: string;
  type: string;
}

export interface OrderTypedData {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
/** Neg-Risk CTF Exchange (`POLY-ALPHA-HUNTER-V4-SPEC-FULL` line 662). */
export const EXCHANGE_V3_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
/** pUSD ERC-20 collateral used as maker/taker asset on the V2/V3 exchange. */
export const PUSD_COLLATERAL_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';

/** V1 order fields, in EIP-712 struct order. */
const ORDER_TYPES_V1: TypedDataField[] = [
  { name: 'tokenId', type: 'uint256' },
  { name: 'makerAmount', type: 'uint256' },
  { name: 'takerAmount', type: 'uint256' },
  { name: 'expiration', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'feeRateBps', type: 'uint256' },
  { name: 'side', type: 'uint8' },
  { name: 'signatureType', type: 'uint8' },
];

/** V2/V3 order fields: `positionId` is appended after `signatureType`. */
const ORDER_TYPES_V3: TypedDataField[] = [...ORDER_TYPES_V1, { name: 'positionId', type: 'uint256' }];

/** Signs Polymarket CLOB orders using EIP-712 typed data via ethers.js. */
export class PolymarketSigner {
  private readonly chainId: number;
  private readonly wallet: ethers.Wallet;

  static isPaperKey(key: string): boolean {
    if (!key) return true;
    const normalized = key.toLowerCase().replace(/^0x/, '');
    if (/[^0-9a-f]/.test(normalized)) return true;
    if (normalized.length !== 64) return true;
    if (/^0+$/.test(normalized)) return true;
    return false;
  }

  constructor(privateKey: string, chainId: number = 137) {
    if (!privateKey) throw new Error('privateKey is required');
    if (PolymarketSigner.isPaperKey(privateKey)) {
      throw new Error(
        'Invalid private key: looks like a placeholder. ' +
          'Set POLY_PRIVATE_KEY to a valid 32-byte hex key or run in paper-trading mode.',
      );
    }
    const key = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
    this.wallet = new ethers.Wallet(key);
    this.chainId = chainId;
  }

  /** Sign an order using EIP-712 typed data */
  async signOrder(order: PolymarketOrder): Promise<SignedOrder> {
    const typed = this.buildTypedData(order);
    const signature = await this.wallet.signTypedData(
      typed.domain,
      { Order: typed.types.Order },
      typed.message,
    );
    return { ...order, signature, maker: this.wallet.address };
  }

  /** Build EIP-712 typed data for a CLOB order (V1 default, V2/V3 on request) */
  buildTypedData(order: PolymarketOrder): OrderTypedData {
    const isV3 = order.protocolVersion === '3';
    if (isV3) assertPositionIdUsable(order);
    const types = isV3 ? ORDER_TYPES_V3 : ORDER_TYPES_V1;

    const message: Record<string, unknown> = {
      tokenId: order.tokenId,
      makerAmount: Math.round(order.size * 1e6).toString(),
      takerAmount: Math.round(order.size * order.price * 1e6).toString(),
      expiration: order.expiration.toString(),
      nonce: order.nonce,
      feeRateBps: order.feeRateBps.toString(),
      side: order.side === 'BUY' ? 0 : 1,
      signatureType: order.signatureType,
    };
    if (isV3) {
      message.positionId = BigInt(order.positionId as string).toString();
    }

    return {
      domain: isV3
        ? {
            name: 'Polymarket CTF Exchange V3',
            version: '1',
            chainId: this.chainId,
            verifyingContract: EXCHANGE_V3_ADDRESS,
          }
        : {
            name: 'Polymarket CTF Exchange',
            version: '1',
            chainId: this.chainId,
            verifyingContract: CTF_EXCHANGE_ADDRESS,
          },
      types: { Order: types },
      primaryType: 'Order',
      message,
    };
  }

  /** Create a deterministic order hash via EIP-712 */
  createOrderHash(order: PolymarketOrder): string {
    const typed = this.buildTypedData(order);
    return ethers.TypedDataEncoder.hash(typed.domain, { Order: typed.types.Order }, typed.message);
  }

  /** Generate a random nonce string */
  generateNonce(): string {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
  }

  /** Get the signer's address */
  getAddress(): string {
    return this.wallet.address;
  }
}
