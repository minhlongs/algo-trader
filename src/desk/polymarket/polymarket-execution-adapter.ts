/**
 * Polymarket Execution Adapter — V2 migration compatibility stub.
 *
 * Bridges the live trading orchestrator with the Polymarket CLOB API
 * for order placement and management.
 * NOTE: Placeholder for the execution adapter module.
 */
import { logger } from '../core/logger';

export interface PolymarketExecutionConfig {
  paperTrading?: boolean;
  chainId?: number;
  apiUrl?: string;
}

export interface ExecutionAdapterResult {
  adapter: unknown | null;
  config: PolymarketExecutionConfig;
}

export function buildPolymarketAdapter(config: PolymarketExecutionConfig): ExecutionAdapterResult {
  logger.debug('buildPolymarketAdapter stub called', 'PolymarketAdapter');
  return { adapter: null, config };
}
