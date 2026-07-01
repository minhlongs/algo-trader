/**
 * Polymarket ECDSA Order Signer
 * EIP-712 typed data signing for Polymarket CLOB orders on Polygon (chainId 137).
 * Docs: https://docs.polymarket.com/#signing-orders
 */

import { ethers } from 'ethers';

/** Polymarket CLOB order (unsigned) */
export interface PolymarketOrder {
  tokenId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  expiration: number;
  nonce: string;
  feeRateBps: number;
  signatureType: 0 | 1 | 2;
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

const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

/**
 * Signs Polymarket CLOB orders using EIP-712 typed data via ethers.js.
 * Chain: Polygon mainnet (chainId 137).
 */
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
      throw new Error("Invalid private key: looks like a placeholder. " +
         +
        'Set POLY_PRIVATE_KEY to a valid 32-byte hex key or run in paper-trading mode.'
      );
    }
    const key = privateKey.startsWith("0x") ? privateKey : "0x" + privateKey;
    this.wallet = new ethers.Wallet(key);
    this.chainId = chainId;
  }

  /** Sign an order using EIP-712 typed data */
  async signOrder(order: PolymarketOrder): Promise<SignedOrder> {
    const typed = this.buildTypedData(order);

    const signature = await this.wallet.signTypedData(
      typed.domain,
      { Order: typed.types.Order },
      typed.message
    );

    return {
      ...order,
      signature,
      maker: this.wallet.address,
    };
  }

  /** Build EIP-712 typed data for a CLOB order */
  buildTypedData(order: PolymarketOrder): OrderTypedData {
    return {
      domain: {
        name: 'Polymarket CTF Exchange',
        version: '1',
        chainId: this.chainId,
        verifyingContract: CTF_EXCHANGE_ADDRESS,
      },
      types: {
        Order: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'makerAmount', type: 'uint256' },
          { name: 'takerAmount', type: 'uint256' },
          { name: 'expiration', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'feeRateBps', type: 'uint256' },
          { name: 'side', type: 'uint8' },
          { name: 'signatureType', type: 'uint8' },
        ],
      },
      primaryType: 'Order',
      message: {
        tokenId: order.tokenId,
        makerAmount: Math.round(order.size * 1e6).toString(),
        takerAmount: Math.round(order.size * order.price * 1e6).toString(),
        expiration: order.expiration.toString(),
        nonce: order.nonce,
        feeRateBps: order.feeRateBps.toString(),
        side: order.side === 'BUY' ? 0 : 1,
        signatureType: order.signatureType,
      },
    };
  }

  /** Create a deterministic order hash via EIP-712 */
  createOrderHash(order: PolymarketOrder): string {
    const typed = this.buildTypedData(order);
    return ethers.TypedDataEncoder.hash(
      typed.domain,
      { Order: typed.types.Order },
      typed.message
    );
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
