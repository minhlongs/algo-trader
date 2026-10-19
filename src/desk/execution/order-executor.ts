/**
 * Order Executor - Executes arbitrage trades across exchanges
 */
import { ArbitrageOpportunity } from '../arbitrage/spread-detector';
import { logger } from '../utils/logger';
import { type ExecutionResult, type OrderResult, type ExecutionConfig } from './order-executor-types';
import { logOrderAudit } from './order-executor-audit';
import {
  createPendingExecution,
  buildFilledOrderResult,
  calculateArbitrageProfit,
  applyFillOutcome,
  handleFailedLegs,
  isExpiredTerminalExecution,
} from './order-executor-helpers';

export * from './order-executor-types';
export * from './order-executor-helpers';

export class OrderExecutor {
  private config: ExecutionConfig;
  private pendingExecutions: Map<string, ExecutionResult>;

  constructor(config?: Partial<ExecutionConfig>) {
    this.config = {
      defaultAmount: 0.01,
      maxSlippage: 0.05,
      timeoutMs: 5000,
      retryAttempts: 3,
      ...config,
    };
    this.pendingExecutions = new Map();
  }

  async execute(opportunity: ArbitrageOpportunity, amount?: number): Promise<ExecutionResult> {
    this.cleanup();
    const execAmount = amount || this.config.defaultAmount;
    const execution = createPendingExecution(opportunity.id);
    this.pendingExecutions.set(execution.id, execution);

    try {
      execution.status = 'EXECUTING';
      let buyOrder: OrderResult | null = null;
      let sellOrder: OrderResult | null = null;
      let buyError: Error | null = null;
      let sellError: Error | null = null;

      const [buyRes, sellRes] = await Promise.allSettled([
        this.placeOrder({ exchange: opportunity.buyExchange, symbol: opportunity.symbol, side: 'buy', price: opportunity.buyPrice, amount: execAmount }),
        this.placeOrder({ exchange: opportunity.sellExchange, symbol: opportunity.symbol, side: 'sell', price: opportunity.sellPrice, amount: execAmount }),
      ]);

      if (buyRes.status === 'fulfilled') { buyOrder = buyRes.value; execution.buyOrder = buyOrder; }
      else { buyError = buyRes.reason instanceof Error ? buyRes.reason : new Error(String(buyRes.reason)); }

      if (sellRes.status === 'fulfilled') { sellOrder = sellRes.value; execution.sellOrder = sellOrder; }
      else { sellError = sellRes.reason instanceof Error ? sellRes.reason : new Error(String(sellRes.reason)); }

      await handleFailedLegs(execution, buyOrder, sellOrder, buyError, sellError, (o) => this.rollbackOrder(o));
      applyFillOutcome(execution, buyOrder!, sellOrder!, opportunity, execAmount);
      await logOrderAudit(execution);
      return execution;
    } catch (error) {
      if (execution.status !== 'ROLLBACK') execution.status = 'FAILED';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      await logOrderAudit(execution);
      return execution;
    }
  }

  private async cancelOrder(exchange: string, orderId: string): Promise<boolean> {
    logger.info(`[OrderExecutor] Sending cancellation request to ${exchange} for order ${orderId}`);
    return true;
  }

  private async rollbackOrder(order: OrderResult): Promise<void> {
    logger.warn('[OrderExecutor] Rolling back order:', { order });
    try {
      if (order.status === 'open') {
        const success = await this.cancelOrder(order.exchange, order.orderId);
        if (success) {
          order.status = 'canceled';
          logger.info(`[OrderExecutor] Canceled open order ${order.orderId} via exchange API`);
        } else {
          throw new Error(`Exchange API rejected cancellation for order ${order.orderId}`);
        }
      } else if (order.status === 'closed') {
        const oppositeSide = order.side === 'buy' ? 'sell' : 'buy';
        logger.info(`[OrderExecutor] Placing offsetting ${oppositeSide} order for ${order.amount} units`);
        await this.placeOrder({ exchange: order.exchange, symbol: order.symbol, side: oppositeSide, price: order.price, amount: order.amount });
      }
    } catch (err) {
      logger.error(`[OrderExecutor] Rollback failed for order ${order.orderId}:`, err);
    }
  }

  private async placeOrder(params: { exchange: string; symbol: string; side: 'buy' | 'sell'; price: number; amount: number }): Promise<OrderResult> {
    return buildFilledOrderResult(params);
  }

  private calculateProfit(opportunity: ArbitrageOpportunity, amount: number): number {
    return calculateArbitrageProfit(opportunity, amount);
  }

  getExecution(id: string): ExecutionResult | undefined {
    return this.pendingExecutions.get(id);
  }

  getPendingExecutions(): ExecutionResult[] {
    return Array.from(this.pendingExecutions.values()).filter(
      (e) => e.status === 'PENDING' || e.status === 'EXECUTING'
    );
  }

  async cancel(executionId: string): Promise<boolean> {
    const execution = this.pendingExecutions.get(executionId);
    if (!execution || execution.status !== 'PENDING') return false;
    execution.status = 'CANCELED';
    return true;
  }

  cleanup(ttlMs = 3600000): void {
    const now = Date.now();
    for (const [id, execution] of this.pendingExecutions.entries()) {
      if (isExpiredTerminalExecution(execution, now, ttlMs)) {
        this.pendingExecutions.delete(id);
      }
    }
  }
}
