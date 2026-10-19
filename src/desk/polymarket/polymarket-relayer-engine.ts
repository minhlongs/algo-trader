/**
 * Polymarket Relayer Engine
 * EIP-712 gasless relayer execution client supporting order signature creation
 * (EOA, Proxy, Safe), nonce synchronization, sub-100ms order submission, and error handling.
 */

import { ethers } from 'ethers';
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
import {
  ORDER_EIP712_TYPES,
  buildEip712Domain,
  buildEip712OrderMessage,
  buildRelayerSubmitPayload,
  parseRelayerSubmitResponse,
} from './polymarket-relayer-helpers';

export * from './polymarket-relayer-types';
export * from './polymarket-relayer-helpers';

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
    const maxFeePerGasStr = gas.maxFeePerGas.toString();
    const maxPriorityFeePerGasStr = gas.maxPriorityFeePerGas.toString();

    const domain = buildEip712Domain(this.chainId, this.verifyingContract);
    const message = buildEip712OrderMessage(
      req,
      nonce,
      expiration,
      feeRateBps,
      signatureType,
      maxFeePerGasStr,
      maxPriorityFeePerGasStr,
    );

    const signature = await this.wallet.signTypedData(domain, ORDER_EIP712_TYPES, message);

    return {
      ...req,
      signature,
      maker: this.wallet.address,
      nonce: nonce.toString(),
      expiration,
      feeRateBps,
      signatureType,
      maxFeePerGas: maxFeePerGasStr,
      maxPriorityFeePerGas: maxPriorityFeePerGasStr,
    };
  }

  public async submitRelayerOrder(order: RelayerSignedOrder): Promise<RelayerOrderResponse> {
    const startTime = Date.now();
    try {
      const payload = buildRelayerSubmitPayload(order);

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

      const data = await res.json();
      return parseRelayerSubmitResponse(data, latencyMs);
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
