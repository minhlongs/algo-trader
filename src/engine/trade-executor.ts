/**
 * Legacy Trade Executor — V2 migration compatibility stub.
 *
 * Dispatches trade signals through the execution adapter.
 * NOTE: Placeholder for the old engine-level executor.
 */
import { logger } from '../desk/core/logger';

export interface TradeExecutorConfig {
  polymarket?: unknown;
}

export class TradeExecutor {
  constructor(config: TradeExecutorConfig) {
    logger.debug('TradeExecutor stub created', 'TradeExecutor');
  }
}
