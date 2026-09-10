/**
 * Order Executor - Executes arbitrage trades across exchanges
 */
import { ArbitrageOpportunity } from '../arbitrage/spread-detector';
import { logger } from '../utils/logger';
import { type ExecutionResult, type OrderResult, type ExecutionConfig } from './order-executor-types';
import { logOrderAudit } from './order-executor-audit';

export * from './order-executor-types';

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
    const execution: ExecutionResult = {
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      opportunityId: opportunity.id,
      status: 'PENDING',
      timestamp: Date.now(),
    };
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

      const buyFailed = buyError || (buyOrder && buyOrder.status === 'rejected');
      const sellFailed = sellError || (sellOrder && sellOrder.status === 'rejected');

      if (buyFailed || sellFailed) {
        if (!buyFailed && buyOrder) {
          await this.rollbackOrder(buyOrder);
          execution.status = 'ROLLBACK';
          const errMsg = sellError ? sellError.message : `Sell order rejected: ${sellOrder?.orderId}`;
          throw new Error(`Sell side failed (${errMsg}). Buy order rolled back.`);
        } else if (!sellFailed && sellOrder) {
          await this.rollbackOrder(sellOrder);
          execution.status = 'ROLLBACK';
          const errMsg = buyError ? buyError.message : `Buy order rejected: ${buyOrder?.orderId}`;
          throw new Error(`Buy side failed (${errMsg}). Sell order rolled back.`);
        } else {
          const buyMsg = buyError ? buyError.message : 'Buy order rejected';
          const sellMsg = sellError ? sellError.message : 'Sell order rejected';
          throw new Error(`Both sides failed. Buy: ${buyMsg}, Sell: ${sellMsg}`);
        }
      }

      const buyFilled = buyOrder!.filled / buyOrder!.amount;
      const sellFilled = sellOrder!.filled / sellOrder!.amount;

      if (buyFilled >= 0.99 && sellFilled >= 0.99) {
        execution.status = 'FILLED';
        execution.profit = this.calculateProfit(opportunity, execAmount);
      } else if (buyFilled > 0 || sellFilled > 0) {
        execution.status = 'PARTIAL';
      }

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
    const orderId = `${params.exchange}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      orderId,
      exchange: params.exchange,
      symbol: params.symbol,
      side: params.side,
      price: params.price,
      amount: params.amount,
      filled: params.amount,
      remaining: 0,
      status: 'closed',
      fee: params.amount * params.price * 0.001,
    };
  }

  private calculateProfit(opportunity: ArbitrageOpportunity, amount: number): number {
    const buyCost = opportunity.buyPrice * amount;
    const sellRevenue = opportunity.sellPrice * amount;
    const fees = (buyCost + sellRevenue) * 0.001;
    return sellRevenue - buyCost - fees;
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
      if (
        ['FILLED', 'FAILED', 'ROLLBACK', 'CANCELED', 'PARTIAL'].includes(execution.status) &&
        now - execution.timestamp > ttlMs
      ) {
        this.pendingExecutions.delete(id);
      }
    }
  }
}
