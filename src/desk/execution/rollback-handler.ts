import type { ExecutionResult, OrderResult } from './order-executor';
import { type RollbackResult, type RollbackConfig, DEFAULT_ROLLBACK_CONFIG } from './rollback-types';
import { buildCloseOrder, calculateLoss, buildRollbackResult } from './rollback-helpers';

export type { RollbackResult, RollbackConfig } from './rollback-types';

export class RollbackHandler {
  private config: RollbackConfig;
  private rollbackHistory: RollbackResult[];

  constructor(config?: Partial<RollbackConfig>) {
    this.config = {
      ...DEFAULT_ROLLBACK_CONFIG,
      ...config,
    };
    this.rollbackHistory = [];
  }

  async handleFailedExecution(execution: ExecutionResult): Promise<RollbackResult> {
    if (!execution.buyOrder && !execution.sellOrder) {
      return this.createResult('NO_ACTION', 0, 'No positions to rollback');
    }

    if (execution.buyOrder && execution.buyOrder.filled > 0 && !execution.sellOrder) {
      return await this.closeLongPosition(execution.buyOrder);
    }

    if (execution.sellOrder && execution.sellOrder.filled > 0 && !execution.buyOrder) {
      return await this.closeShortPosition(execution.sellOrder);
    }

    if (execution.buyOrder && execution.sellOrder) {
      const buyFilled = execution.buyOrder.filled;
      const sellFilled = execution.sellOrder.filled;

      if (buyFilled > sellFilled) {
        return await this.closeLongPosition(execution.buyOrder, buyFilled - sellFilled);
      } else if (sellFilled > buyFilled) {
        return await this.closeShortPosition(execution.sellOrder, sellFilled - buyFilled);
      }
    }

    return this.createResult('NO_ACTION', 0, 'No rollback needed');
  }

  private async closeLongPosition(order: OrderResult, amount?: number): Promise<RollbackResult> {
    const closeAmount = amount || order.filled;
    if (closeAmount <= 0) {
      return this.createResult('NO_ACTION', 0, 'No position to close');
    }

    const closeOrder = buildCloseOrder(order, 'sell', { longSlippage: 0.99, shortSlippage: 1.01 }, closeAmount);
    const loss = this.calculateLoss(order, closeOrder);

    // original code had: action = loss > 0 ? 'CLOSE_LONG' : 'CLOSE_LONG';
    const action = 'CLOSE_LONG';

    const result = this.createResult(action, loss, 'Closed long position');
    result.closedOrder = closeOrder;
    return result;
  }

  private async closeShortPosition(order: OrderResult, amount?: number): Promise<RollbackResult> {
    const closeAmount = amount || order.filled;
    if (closeAmount <= 0) {
      return this.createResult('NO_ACTION', 0, 'No position to close');
    }

    const closeOrder = buildCloseOrder(order, 'buy', { longSlippage: 0.99, shortSlippage: 1.01 }, closeAmount);
    const loss = this.calculateLoss(order, closeOrder);

    const result = this.createResult('CLOSE_SHORT', loss, 'Closed short position');
    result.closedOrder = closeOrder;
    return result;
  }

  private calculateLoss(openOrder: OrderResult, closeOrder: OrderResult): number {
    return calculateLoss(openOrder, closeOrder);
  }

  private createResult(action: RollbackResult['action'], loss: number, reason: string): RollbackResult {
    const result = buildRollbackResult(action, loss, reason, this.config.maxLossPercent);
    this.rollbackHistory.push(result);
    return result;
  }

  getHistory(limit = 100): RollbackResult[] {
    return this.rollbackHistory.slice(-limit);
  }

  getTotalLosses(): number {
    return this.rollbackHistory.reduce((sum, r) => sum + r.loss, 0);
  }

  clearHistory(olderThanMs = 86400000): void {
    const cutoff = Date.now() - olderThanMs;
    this.rollbackHistory = this.rollbackHistory.filter((r) => r.timestamp > cutoff);
  }
}
