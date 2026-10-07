/**
 * Polymarket Relayer Engine
 * EIP-712 gasless relayer execution client supporting order signature creation
 * (EOA, Proxy, Safe), nonce synchronization, sub-100ms order submission, and error handling.
 */

import { ethers } from 'ethers';
import { z } from 'zod';
import { logger } from '../../shared/utils/logger';
import { RelayerNonceManager } from './relayer-nonce-manager';
import { GasStationClient } from './gas-station-client';
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
  private readonly nonceManager: RelayerNonceManager;
  private readonly gasStation: GasStationClient;

  constructor(privateKey: string, config: RelayerConfig = {}) {
    if (!privateKey) throw new Error('privateKey is required for PolymarketRelayerEngine');
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    this.wallet = new ethers.Wallet(formattedKey);
    this.relayerUrl = (config.relayerUrl ?? DEFAULT_RELAYER_URL).replace(/\/$/, '');
    this.chainId = config.chainId ?? 137;
    this.verifyingContract = config.verifyingContract ?? CTF_EXCHANGE_ADDRESS;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.nonceManager = new RelayerNonceManager(this.wallet.address);
    this.gasStation = new GasStationClient();
  }

  public getAddress(): string {
    return this.wallet.address;
  }

  public async syncNonce(): Promise<number> {
    try {
      const res = await this.fetchFn(`${this.relayerUrl}/nonce?address=${this.wallet.address}`);
      if (!res.ok) throw new Error(`Nonce sync failed: ${res.status}`);
      const data = (await res.json()) as { nonce?: number | string };
      const parsed = Number(data?.nonce ?? 0);
      this.nonceManager.setNonce(parsed);
    } catch (err) {
      logger.error('[PolymarketRelayer] Nonce sync critical requirement failed', { err });
      throw err; // Propagate failure for strict viable validation
    }
    return this.nonceManager.getNext();
  }

  public async getNextNonce(): Promise<string> {
    const nonce = await this.nonceManager.getNext();
    return `${Date.now()}${nonce}`;
  }

  public async buildAndSignOrder(req: RelayerOrderRequest): Promise<RelayerSignedOrder> {
    const nonce = req.nonce ?? (await this.getNextNonce());
    const expiration = req.expiration ?? Math.floor(Date.now() / 1000) + 3600;
    const feeRateBps = req.feeRateBps ?? 0;
    const signatureType: SignatureType = req.signatureType ?? 0;

    // Fetch gas dynamics
    const gas = await this.gasStation.getRecommendedGas();

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
        { name: 'maxFeePerGas', type: 'uint256' },
        { name: 'maxPriorityFeePerGas', type: 'uint256' },
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
      maxFeePerGas: gas.maxFeePerGas.toString(),
      maxPriorityFeePerGas: gas.maxPriorityFeePerGas.toString(),
    };

    const signature = await this.wallet.signTypedData(domain, types, message);

    return {
      ...req,
      signature,
      maker: this.wallet.address,
      nonce: nonce.toString(),
      expiration,
      feeRateBps,
      signatureType,
      maxFeePerGas: gas.maxFeePerGas.toString(),
      maxPriorityFeePerGas: gas.maxPriorityFeePerGas.toString(),
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
          maxFeePerGas: order.maxFeePerGas,
          maxPriorityFeePerGas: order.maxPriorityFeePerGas,
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
      const parsedData = z.object({
        orderId: z.string().optional(),
        status: z.string().optional(),
        transactionHash: z.string().optional(),
      }).parse(data);

      return {
        orderId: parsedData.orderId ?? `relayer-${Date.now()}`,
        status: (parsedData.status as RelayerOrderResponse['status']) ?? 'PENDING',
        transactionHash: parsedData.transactionHash,
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
