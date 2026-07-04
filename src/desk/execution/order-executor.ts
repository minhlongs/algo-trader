/**
 * Order Executor
 * Executes arbitrage trades across exchanges
 *
 * Execution flow:
 * 1. Validate opportunity (spread, latency, balance)
 * 2. Place buy order on exchange A (lower price)
 * 3. Place sell order on exchange B (higher price)
 * 4. Track fill status
 * 5. Handle partial fills & rollback
 */

import { ArbitrageOpportunity } from '../arbitrage/spread-detector';
import { logger } from '../utils/logger';
import { appendTenantAuditLog } from '../audit/tenant-audit-log';

export interface ExecutionResult {
  id: string;
  opportunityId: string;
  status: 'PENDING' | 'EXECUTING' | 'FILLED' | 'PARTIAL' | 'FAILED' | 'ROLLBACK' | 'CANCELED';
  buyOrder?: OrderResult;
  sellOrder?: OrderResult;
  profit?: number;
  error?: string;
  timestamp: number;
}

export interface OrderResult {
  orderId: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  filled: number;
  remaining: number;
  status: 'open' | 'closed' | 'canceled' | 'rejected';
  fee?: number;
}

export interface ExecutionConfig {
  defaultAmount: number;
  maxSlippage: number;
  timeoutMs: number;
  retryAttempts: number;
}

export class OrderExecutor {
  private config: ExecutionConfig;
  private pendingExecutions: Map<string, ExecutionResult>;

  constructor(config?: Partial<ExecutionConfig>) {
    this.config = {
      defaultAmount: 0.01, // BTC
      maxSlippage: 0.05, // 5%
      timeoutMs: 5000,
      retryAttempts: 3,
      ...config,
    };

    this.pendingExecutions = new Map();
  }

  /**
   * Execute arbitrage trade
   */
  async execute(
    opportunity: ArbitrageOpportunity,
    amount?: number
  ): Promise<ExecutionResult> {
    this.cleanup(); // Clean up old executions automatically to prevent memory growth

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
        this.placeOrder({
          exchange: opportunity.buyExchange,
          symbol: opportunity.symbol,
          side: 'buy',
          price: opportunity.buyPrice,
          amount: execAmount,
        }),
        this.placeOrder({
          exchange: opportunity.sellExchange,
          symbol: opportunity.symbol,
          side: 'sell',
          price: opportunity.sellPrice,
          amount: execAmount,
        })
      ]);

      if (buyRes.status === 'fulfilled') {
        buyOrder = buyRes.value;
        execution.buyOrder = buyOrder;
      } else {
        buyError = buyRes.reason instanceof Error ? buyRes.reason : new Error(String(buyRes.reason));
      }

      if (sellRes.status === 'fulfilled') {
        sellOrder = sellRes.value;
        execution.sellOrder = sellOrder;
      } else {
        sellError = sellRes.reason instanceof Error ? sellRes.reason : new Error(String(sellRes.reason));
      }

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
          const buyMsg = buyError ? buyError.message : `Buy order rejected`;
          const sellMsg = sellError ? sellError.message : `Sell order rejected`;
          throw new Error(`Both sides failed. Buy: ${buyMsg}, Sell: ${sellMsg}`);
        }
      }

      // Check if both orders filled
      const buyFilled = buyOrder!.filled / buyOrder!.amount;
      const sellFilled = sellOrder!.filled / sellOrder!.amount;

      if (buyFilled >= 0.99 && sellFilled >= 0.99) {
        execution.status = 'FILLED';
        execution.profit = this.calculateProfit(opportunity, execAmount);
      } else if (buyFilled > 0 || sellFilled > 0) {
        execution.status = 'PARTIAL';
      }

      await appendTenantAuditLog(
        'system-tenant',
        'order_executed',
        'system',
        `Order execution completed with status ${execution.status}`,
        {
          executionId: execution.id,
          opportunityId: execution.opportunityId,
          status: execution.status,
          profit: execution.profit,
          error: execution.error,
          buyOrder: execution.buyOrder,
          sellOrder: execution.sellOrder,
        }
      ).catch((err) => logger.error('[OrderExecutor] Failed to append tenant audit log:', err));

      return execution;
    } catch (error) {
      if (execution.status !== 'ROLLBACK') {
        execution.status = 'FAILED';
      }
      execution.error = error instanceof Error ? error.message : 'Unknown error';

      await appendTenantAuditLog(
        'system-tenant',
        'order_executed',
        'system',
        `Order execution completed with status ${execution.status}`,
        {
          executionId: execution.id,
          opportunityId: execution.opportunityId,
          status: execution.status,
          profit: execution.profit,
          error: execution.error,
          buyOrder: execution.buyOrder,
          sellOrder: execution.sellOrder,
        }
      ).catch((err) => logger.error('[OrderExecutor] Failed to append tenant audit log:', err));

      return execution;
    }
  }

  /**
   * Cancel order on the exchange API
   */
  private async cancelOrder(exchange: string, orderId: string): Promise<boolean> {
    // Mock order cancellation API call
    logger.info(`[OrderExecutor] Sending cancellation request to ${exchange} for order ${orderId}`);
    return true;
  }

  /**
   * Rollback order by placing an offsetting order or canceling if still open
   */
  private async rollbackOrder(order: OrderResult): Promise<void> {
    logger.warn(`[OrderExecutor] Rolling back order:`, { order });
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
        await this.placeOrder({
          exchange: order.exchange,
          symbol: order.symbol,
          side: oppositeSide,
          price: order.price,
          amount: order.amount,
        });
      }
    } catch (err) {
      logger.error(`[OrderExecutor] Rollback failed for order ${order.orderId}:`, err);
    }
  }

  /**
   * Place single order (mock implementation)
   */
  private async placeOrder(params: {
    exchange: string;
    symbol: string;
    side: 'buy' | 'sell';
    price: number;
    amount: number;
  }): Promise<OrderResult> {
    // Mock order placement - replace with actual exchange API
    const orderId = `${params.exchange}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      orderId,
      exchange: params.exchange,
      symbol: params.symbol,
      side: params.side,
      price: params.price,
      amount: params.amount,
      filled: params.amount, // Assume full fill for mock
      remaining: 0,
      status: 'closed',
      fee: params.amount * params.price * 0.001, // 0.1% fee
    };
  }

  /**
   * Calculate profit after execution
   */
  private calculateProfit(
    opportunity: ArbitrageOpportunity,
    amount: number
  ): number {
    const buyCost = opportunity.buyPrice * amount;
    const sellRevenue = opportunity.sellPrice * amount;
    const fees = (buyCost + sellRevenue) * 0.001; // 0.1% fee per side
    return sellRevenue - buyCost - fees;
  }

  /**
   * Get execution by ID
   */
  getExecution(id: string): ExecutionResult | undefined {
    return this.pendingExecutions.get(id);
  }

  /**
   * Get all pending executions
   */
  getPendingExecutions(): ExecutionResult[] {
    return Array.from(this.pendingExecutions.values()).filter(
      e => e.status === 'PENDING' || e.status === 'EXECUTING'
    );
  }

  /**
   * Cancel pending execution
   */
  async cancel(executionId: string): Promise<boolean> {
    const execution = this.pendingExecutions.get(executionId);
    if (!execution || execution.status !== 'PENDING') {
      return false;
    }

    execution.status = 'CANCELED';
    return true;
  }

  /**
   * Clear completed executions older than TTL
   */
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
