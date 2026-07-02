/**
 * Market Maker Strategy — V2 migration stub.
 *
 * Provides two-sided liquidity on Polymarket markets,
 * capturing the bid-ask spread.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import { EventEmitter } from 'events';
import type { ClobClient } from '../../polymarket/clob-client';
import type { StrategyConfig } from '../../core/types';
import type { MarketInfo } from '../../core/types';
import { logger } from '../../core/logger';

export class MarketMakerStrategy extends EventEmitter {
  constructor(
    private clobClient: ClobClient,
    private cfg: StrategyConfig,
    private capital: string,
  ) {
    super();
    logger.warn('[market-maker] Strategy stub — no real trading logic', 'MarketMakerStrategy');
  }

  addMarket(opp: MarketInfo): void {
    // No-op stub
  }

  setFairValue(_tokenId: string, _prob: number, _confidence: number): void {
    // No-op stub
  }
}
