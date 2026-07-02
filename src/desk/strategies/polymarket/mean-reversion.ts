/**
 * Mean Reversion Strategy — V2 migration stub.
 *
 * Trades mean-reversion on Polymarket binary options
 * when prices deviate from their moving averages.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import { EventEmitter } from 'events';
import type { ClobClient } from '../../polymarket/clob-client';
import type { MarketScanner } from '../../polymarket/market-scanner';
import type { StrategyConfig } from '../../core/types';
import { logger } from '../../core/logger';

export class MeanReversionStrategy extends EventEmitter {
  constructor(
    private clobClient: ClobClient,
    private scanner: MarketScanner,
    private cfg: StrategyConfig,
    private capital: string,
  ) {
    super();
    logger.warn('[mean-reversion] Strategy stub — no real trading logic', 'MeanReversionStrategy');
  }

  onPriceUpdate(_tokenId: string, _price: number): void {
    // No-op stub
  }

  async stop(): Promise<void> {
    // No-op stub
  }
}
