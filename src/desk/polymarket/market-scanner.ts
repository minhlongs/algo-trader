/**
 * Market Scanner — V2 migration compatibility stub.
 *
 * Discovers active markets on Polymarket and filters
 * by volume/liquidity criteria.
 * NOTE: Placeholder for the market discovery module.
 */
import { logger } from '../core/logger';
import type { ClobClient } from './clob-client';

export interface ScanResult {
  opportunities: Array<{
    yesTokenId: string;
    noTokenId: string;
    conditionId: string;
    volume: number;
    liquidity: number;
  }>;
}

export class MarketScanner {
  constructor(private clobClient: ClobClient) {
    logger.debug('MarketScanner stub created', 'MarketScanner');
  }

  async scan(_opts: { minVolume: number }): Promise<ScanResult> {
    return { opportunities: [] };
  }
}
