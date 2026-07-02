/**
 * Backtest Runner
 *
 * Replays historical Gamma market data through any registered V2 strategy
 * and computes performance metrics. No real orders placed — trades are
 * simulated based on strategy signals.
 *
 * Usage:
 *   const runner = new BacktestRunner();
 *   const result = await runner.run({
 *     strategy: 'spread-mean-reversion',
 *     paperTrading: true,
 *     capitalUsdc: 5000,
 *     days: 30,
 *   });
 *   console.log(result.metrics);
 */

import type { ClobClient, RawOrderBook } from '../polymarket/clob-client';
import type { StrategyName } from '../core/types';
import type { GammaClient, GammaMarket } from '../polymarket/gamma-client';
import type { OrderManager } from '../polymarket/order-manager';
import type { BasePolymarketStrategy, StrategyDeps } from '../strategies/polymarket/base-polymarket-strategy';
import { getStrategy } from '../polymarket/strategy-registry';
import { GammaHistoricalProvider } from './gamma-historical-provider';
import { computeMetrics } from './metrics-calculator';
import { logger } from '../../shared/utils/logger';
import type { BacktestConfig, BacktestResult, BacktestTrade, HistoricalSnapshot } from './types';

// ── Mock Order Manager ─────────────────────────────────────────────────────────

class BacktestOrderManager implements OrderManager {
  trades: BacktestTrade[] = [];
  equityCurve: Array<{ timestamp: string; equity: number }> = [];
  private capital: number;
  private currentEquity: number;
  private positions = new Map<string, { size: number; avgPrice: number }>();

  constructor(capital: number) {
    this.capital = capital;
    this.currentEquity = capital;
  }

  async placeOrder(params: {
    tokenId: string;
    side: 'buy' | 'sell';
    price: string;
    size: string;
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  }): Promise<{ id: string }> {
    const side = params.side === 'buy' ? 'BUY' : 'SELL';
    const price = parseFloat(params.price);
    const size = parseFloat(params.size);
    const pnl = this.computePnl(params.tokenId, side, price, size);

    const trade: BacktestTrade = {
      timestamp: new Date().toISOString(),
      tokenId: params.tokenId,
      side,
      price,
      size,
      pnl,
    };
    this.trades.push(trade);

    if (pnl !== null) {
      this.currentEquity += pnl;
    }

    return { id: `backtest-${this.trades.length}` };
  }

  async cancelOrder(_orderId: string): Promise<void> {
    // No-op in backtesting
  }

  async cancelAllOrders(_tokenId?: string): Promise<void> {
    // No-op in backtesting
  }

  async getOpenOrders(_tokenId?: string): Promise<Array<{ id: string; side: string; price: number; size: number }>> {
    return [];
  }

  getTrades(): BacktestTrade[] {
    return [...this.trades];
  }

  getEquityCurve(): Array<{ timestamp: string; equity: number }> {
    return [...this.equityCurve];
  }

  getCurrentEquity(): number {
    return this.currentEquity;
  }

  private computePnl(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number,
  ): number | null {
    const existing = this.positions.get(tokenId);
    if (side === 'BUY') {
      // Opening or adding to position
      if (existing) {
        const newSize = existing.size + size;
        const newAvgPrice =
          (existing.avgPrice * existing.size + price * size) / newSize;
        this.positions.set(tokenId, { size: newSize, avgPrice: newAvgPrice });
      } else {
        this.positions.set(tokenId, { size, avgPrice: price });
      }
      return null; // Unrealized until sold
    } else {
      // SELL — closing or reducing
      if (!existing || existing.size <= 0) {
        // Short entry or no position — treat as opening short
        this.positions.set(tokenId, { size: -size, avgPrice: price });
        return null;
      }
      const closeSize = Math.min(size, existing.size);
      const pnl = closeSize * (price - existing.avgPrice);
      const remaining = existing.size - closeSize;
      if (remaining <= 0) {
        this.positions.delete(tokenId);
      } else {
        this.positions.set(tokenId, { size: remaining, avgPrice: existing.avgPrice });
      }
      return pnl;
    }
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────────

 
type StrategyConstructor = new (
  deps: StrategyDeps,
  config: Record<string, unknown>,
  name: string,
) => BasePolymarketStrategy;

export class BacktestRunner {
  private historicalProvider = new GammaHistoricalProvider();

  async run(config: BacktestConfig): Promise<BacktestResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const warnings: string[] = [];

    // Look up strategy
    const entry = getStrategy(config.strategy);
    if (!entry) {
      throw new Error(`Unknown strategy: ${config.strategy}`);
    }

    // Fetch historical data
    const snapshots = await this.historicalProvider.fetchHistoricalSnapshots(
      config.days,
      config.tickIntervalMs ?? 3_600_000,
    );

    if (snapshots.length === 0) {
      throw new Error('No historical data available for backtest');
    }

    // Create strategy with backtesting deps
    const orderManager = new BacktestOrderManager(config.capitalUsdc);
    const gammaClient = this.createHistoricalGammaClient(snapshots);

    const mockClob: ClobClient = {
      getOrderBook: async (_tokenId: string): Promise<RawOrderBook> => ({ bids: [], asks: [], timestamp: 0 }),
      getPrice: async (_tokenId: string): Promise<number> => 0,
      getMidPrice: async (_tokenId: string): Promise<number> => 0,
    };

    const deps: StrategyDeps = {
      clob: mockClob,
      orderManager,
      eventBus: { emit: () => {}, on: () => {}, off: () => {} },
      gamma: gammaClient,
    };

    const strategy = new (entry.ctor as StrategyConstructor)(
      deps,
      config.strategyConfig ?? entry.defaultConfig,
      config.strategy as StrategyName,
    );

    // Replay ticks
    for (const snapshot of snapshots) {
      try {
        await (strategy as BasePolymarketStrategy).execute();
      } catch (err) {
        logger.warn('Backtest tick error', 'BacktestRunner', {
          strategy: config.strategy,
          timestamp: snapshot.timestamp,
          err: String(err),
        });
      }

      // Record equity point
      orderManager.equityCurve.push({
        timestamp: snapshot.timestamp,
        equity: orderManager.getCurrentEquity(),
      });
    }

    // Compute metrics
    const trades = orderManager.getTrades();
    const equityCurve = orderManager.getEquityCurve();
    const metrics = computeMetrics(trades, equityCurve);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    logger.info('Backtest complete', 'BacktestRunner', {
      strategy: config.strategy,
      trades: trades.length,
      pnl: metrics.totalPnl,
      sharpe: metrics.sharpeRatio,
    });

    return {
      strategy: config.strategy as StrategyName,
      config,
      metrics,
      trades,
      equityCurve,
      startedAt,
      completedAt,
      durationMs,
      warnings,
    };
  }

  clearCache(): void {
    this.historicalProvider.clearCache();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private createHistoricalGammaClient(snapshots: HistoricalSnapshot[]): GammaClient {
    let tickIndex = 0;

    return {
      async getMarkets(): Promise<GammaMarket[]> {
        if (tickIndex >= snapshots.length) return [];
        const snapshot = snapshots[tickIndex++];
        return snapshot.markets.map((m) => ({
          id: m.conditionId,
          question: m.question,
          conditionId: m.conditionId,
          slug: '',
          outcomes: ['Yes', 'No'],
          outcomePrices: [String(m.yesPrice), String(1 - m.yesPrice)],
          volume: m.volume,
          liquidity: m.liquidity,
          endDate: m.endDate,
          active: true,
          closed: m.closed,
          tokens: [
            { token_id: m.yesTokenId ?? `${m.conditionId}-yes`, outcome: 'Yes', price: m.yesPrice },
            { token_id: m.noTokenId ?? `${m.conditionId}-no`, outcome: 'No', price: 1 - m.yesPrice },
          ],
          yesTokenId: m.yesTokenId ?? `${m.conditionId}-yes`,
          noTokenId: m.noTokenId ?? `${m.conditionId}-no`,
          yesPrice: m.yesPrice,
        }));
      },
      async getMarket(): Promise<GammaMarket | null> { return null; },
      async getMarketGroup(): Promise<null> { return null; },
      async searchMarkets(): Promise<GammaMarket[]> { return []; },
      async getTrending(): Promise<GammaMarket[]> { return []; },
      async getEvents(): Promise<Array<{ id: string; title: string; slug: string; markets: GammaMarket[] }>> { return []; },
    };
  }
}
