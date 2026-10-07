/**
 * Dynamic Fee Client (EIP-1559)
 * Interacts with Polymarket or standard gas stations to fetch optimized baseFee + priorityFee.
 */
import { logger } from '../../shared/utils/logger';
import { z } from 'zod';

export interface GasPrices {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export class GasStationClient {
  private readonly apiUrl: string;

  constructor(apiUrl: string = 'https://gasstation.polymarket.com') {
    this.apiUrl = apiUrl;
  }

  public async getRecommendedGas(): Promise<GasPrices> {
    try {
      const response = await fetch(this.apiUrl);
      if (!response.ok) throw new Error('Failed to fetch gas prices');
      const data = await response.json();

      const dataReceived = z.object({
        maxFeePerGas: z.string(),
        maxPriorityFeePerGas: z.string(),
      }).parse(data);

      // Expected result structure: { maxFeePerGas: string, maxPriorityFeePerGas: string }
      return {
        maxFeePerGas: BigInt(dataReceived.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(dataReceived.maxPriorityFeePerGas),
      };
    } catch (err) {
      logger.warn('[GasStationClient] Failed to fetch, using conservative defaults', { err });
      // Returns conservative static values if API fails
      return {
        maxFeePerGas: BigInt(50_000_000_000), // 50 Gwei
        maxPriorityFeePerGas: BigInt(2_000_000_000), // 2 Gwei
      };
    }
  }
}
