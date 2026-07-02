/**
 * Cross-Market Arbitrage Strategy — V2 migration stub.
 *
 * Detects and executes arbitrage opportunities between
 * related Polymarket markets.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import { EventEmitter } from 'events';
import type { ClobClient } from '../../polymarket/clob-client';
import type { MarketScanner } from '../../polymarket/market-scanner';
import type { StrategyConfig } from '../../core/types';
import { logger } from '../../core/logger';

export class CrossMarketArbStrategy extends EventEmitter {
  constructor(
    private clobClient: ClobClient,
    private scanner: MarketScanner,
    private cfg: StrategyConfig,
    private capital: string,
  ) {
    super();
    logger.warn('[cross-market-arb] Strategy stub — no real trading logic', 'CrossMarketArbStrategy');
  }
}
