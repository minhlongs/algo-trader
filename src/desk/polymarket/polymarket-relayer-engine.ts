/**
 * Polymarket Relayer Engine
 * EIP-712 gasless relayer execution client supporting order signature creation
 * (EOA, Proxy, Safe), nonce synchronization, sub-100ms order submission, and error handling.
 */

import { ethers } from 'ethers';
import { logger } from '../../shared/utils/logger';
import {
  DEFAULT_RELAYER_URL,
  CTF_EXCHANGE_ADDRESS,
  type SignatureType,
  type RelayerOrderRequest,
  type RelayerSignedOrder,
  type RelayerOrderResponse,
  type RelayerConfig,
} from './polymarket-relayer-types';

export * from './polymarket-relayer-types';

export class PolymarketRelayerEngine {
  private readonly wallet: ethers.Wallet;
  private readonly relayerUrl: string;
  private readonly chainId: number;
  private readonly verifyingContract: string;
  private readonly fetchFn: typeof fetch;
  private currentNonce = 0;

  constructor(privateKey: string, config: RelayerConfig = {}) {
    if (!privateKey) throw new Error('privateKey is required for PolymarketRelayerEngine');
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    this.wallet = new ethers.Wallet(formattedKey);
    this.relayerUrl = (config.relayerUrl ?? DEFAULT_RELAYER_URL).replace(/\/$/, '');
    this.chainId = config.chainId ?? 137;
    this.verifyingContract = config.verifyingContract ?? CTF_EXCHANGE_ADDRESS;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  public getAddress(): string {
    return this.wallet.address;
  }

  public async syncNonce(): Promise<number> {
    try {
      const res = await this.fetchFn(`${this.relayerUrl}/nonce?address=${this.wallet.address}`);
      if (res.ok) {
        const data = (await res.json()) as { nonce?: number | string };
        const parsed = Number(data?.nonce ?? 0);
        this.currentNonce = Math.max(this.currentNonce, parsed);
      }
    } catch (err) {
      logger.warn('[PolymarketRelayer] Nonce sync failed, using local counter', { err });
    }
    return this.currentNonce;
  }

  public getNextNonce(): string {
    this.currentNonce++;
    return `${Date.now()}${this.currentNonce}`;
  }

  public async buildAndSignOrder(req: RelayerOrderRequest): Promise<RelayerSignedOrder> {
    const nonce = req.nonce ?? this.getNextNonce();
    const expiration = req.expiration ?? Math.floor(Date.now() / 1000) + 3600;
    const feeRateBps = req.feeRateBps ?? 0;
    const signatureType: SignatureType = req.signatureType ?? 0;

    const domain = {
      name: 'Polymarket CTF Exchange',
      version: '1',
      chainId: this.chainId,
      verifyingContract: this.verifyingContract,
    };

    const types = {
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
    };

    const makerAmount = Math.round(req.size * 1e6).toString();
    const takerAmount = Math.round(req.size * req.price * 1e6).toString();

    const message = {
      tokenId: req.tokenId,
      makerAmount,
      takerAmount,
      expiration: expiration.toString(),
      nonce,
      feeRateBps: feeRateBps.toString(),
      side: req.side === 'BUY' ? 0 : 1,
      signatureType,
    };

    const signature = await this.wallet.signTypedData(domain, types, message);

    return {
      ...req,
      signature,
      maker: this.wallet.address,
      nonce,
      expiration,
      feeRateBps,
      signatureType,
    };
  }

  public async submitRelayerOrder(order: RelayerSignedOrder): Promise<RelayerOrderResponse> {
    const startTime = Date.now();
    try {
      const payload = {
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
        },
      };

      const res = await this.fetchFn(`${this.relayerUrl}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errText = await res.text();
        return { orderId: '', status: 'FAILED', latencyMs, error: `Relayer rejected: ${res.status} ${errText}` };
      }

      const data = (await res.json()) as { orderId?: string; status?: string; transactionHash?: string };
      return {
        orderId: data.orderId ?? `relayer-${Date.now()}`,
        status: (data.status as RelayerOrderResponse['status']) ?? 'PENDING',
        transactionHash: data.transactionHash,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      logger.error('[PolymarketRelayer] Order submission error', { error, latencyMs });
      return { orderId: '', status: 'FAILED', latencyMs, error };
    }
  }

  public async executeGaslessOrder(req: RelayerOrderRequest): Promise<RelayerOrderResponse> {
    const signed = await this.buildAndSignOrder(req);
    return this.submitRelayerOrder(signed);
  }
}
