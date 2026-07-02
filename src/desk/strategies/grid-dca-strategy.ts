/**
 * Grid / DCA Strategy — legacy factory stub.
 *
 * Places grid buy/sell orders or dollar-cost-averages into positions
 * on supported CEX exchanges. Configurable spacing, number of levels,
 * and order size.
 *
 * NOTE: This is a placeholder awaiting V2 migration.
 * The factory logs a warning and returns a no-op tick function.
 */
import { logger } from '../core/logger';

export interface GridDcaParams {
  exchange: string;
  symbol: string;
  gridSpacing: number;
  numLevels: number;
  orderSize: number;
}

export interface GridDcaDeps {
  executor: unknown;
  client: unknown;
  eventBus: unknown;
  params: GridDcaParams;
}

export function createGridDcaTick(deps: GridDcaDeps): () => Promise<void> {
  logger.warn('[grid-dca] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
