/**
 * CEX Order Executor
 *
 * Bridges IStrategy signals to BinanceSpotClient order placement.
 * dYdX is read-only in MVP — order placement is not supported.
 *
 * Perp/leverage is GATED: throws if CEX_PERP_ENABLED != "true".
 */

import type { ISignal } from '../interfaces/IStrategy.js';
import { BinanceSpotClient } from '../markets/cex/binance-spot-client.js';
import type { CexSpotOrderRequest, CexOrderResponse } from '../markets/cex/cex-types.js';
import { loadFeatureFlags } from '../markets/cex/cex-types.js';
import { logger } from '../core/logger.js';

export interface CexExecutorConfig {
  /** ccxt-style symbol, e.g. "BTC/USDT" */
  symbol: string;
  /** Base order size in quote currency (e.g. USDT) */
  orderSizeUsdt: number;
  /** If true, log but do not submit orders */
  dryRun?: boolean;
}

export class CexOrderExecutor {
  private readonly client: BinanceSpotClient;
  private readonly config: CexExecutorConfig;

  constructor(config: CexExecutorConfig, client?: BinanceSpotClient) {
    this.config = config;
    const flags = loadFeatureFlags();
    this.client = client ?? new BinanceSpotClient(flags);
  }

  /**
   * Execute a strategy signal as a Binance spot market order.
   * Signals with action='wait' are ignored.
   *
   * @param signal  ISignal from strategy.execute()
   * @returns Order response, or null if no action taken
   */
  async execute(signal: ISignal): Promise<CexOrderResponse | null> {
    if (signal.action === 'wait') {
      logger.debug('CEX executor: signal=wait, skipping', 'CexOrderExecutor', {
        reason: signal.reason,
      });
      return null;
    }

    const req: CexSpotOrderRequest = {
      symbol: this.config.symbol,
      side: signal.action, // 'buy' | 'sell'
      type: 'market',
      amount: this.config.orderSizeUsdt,
    };

    if (this.config.dryRun) {
      logger.info('CEX executor dry-run: would place order', 'CexOrderExecutor', {
        ...req,
        confidence: signal.confidence,
        reason: signal.reason,
      });
      // Return a synthetic response for dry-run tracing
      return {
        id: `dry-run-${Date.now()}`,
        symbol: req.symbol,
        side: req.side,
        type: req.type,
        amount: req.amount,
        price: undefined,
        status: 'dry-run',
        timestamp: Date.now(),
      };
    }

    logger.info('CEX executor: placing order', 'CexOrderExecutor', {
      ...req,
      confidence: signal.confidence,
    });

    try {
      const response = await this.client.placeOrder(req);
      logger.info('CEX executor: order placed', 'CexOrderExecutor', {
        id: response.id,
        status: response.status,
      });
      return response;
    } catch (err) {
      logger.error('CEX executor: order failed', 'CexOrderExecutor', { error: String(err) });
      throw err;
    }
  }

  /** Exchange name for identification */
  getName(): string {
    return `cex-executor:${this.client.getName()}`;
  }
}
