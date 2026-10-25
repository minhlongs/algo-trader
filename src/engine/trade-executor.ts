/**
 * Engine Trade Executor — Dispatches trade orders through the V2 Polymarket execution adapter
 * and optional LiveExecutionGuard risk checks.
 */
import { logger } from '../desk/core/logger';
import type { PolymarketAdapter, PolymarketOrderResponse } from '../desk/execution/polymarket-adapter';
import type { PolymarketOrder } from '../desk/execution/polymarket-signer';
import type { LiveExecutionGuard } from '../desk/execution/live-execution-guard';

export interface TradeExecutorConfig {
  polymarket?: PolymarketAdapter | null;
  guard?: LiveExecutionGuard;
}

export class TradeExecutor {
  private readonly adapter: PolymarketAdapter | null;
  private readonly guard?: LiveExecutionGuard;
  private executedCount = 0;

  constructor(config: TradeExecutorConfig = {}) {
    this.adapter = config.polymarket ?? null;
    this.guard = config.guard;
    if (this.adapter && this.guard) {
      this.guard.setEnabled(true);
    }
    logger.debug(
      `TradeExecutor initialized (${this.adapter ? 'LIVE_ADAPTER' : 'PAPER_STUB'})`,
      'TradeExecutor',
    );
  }

  isLive(): boolean {
    return this.adapter !== null;
  }

  getExecutedCount(): number {
    return this.executedCount;
  }

  async executeOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    if (this.guard) {
      const check = this.guard.guardOrder(order);
      if (!check.approved) {
        throw new Error(`TradeExecutor guard rejected order: ${check.reason}`);
      }
    }

    this.executedCount += 1;

    if (this.adapter) {
      return this.adapter.placeOrder(order);
    }

    return {
      orderID: `paper-exec-${Date.now()}-${this.executedCount}`,
      status: 'matched',
    };
  }
}
