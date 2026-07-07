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
    price: string | number;
    size: string | number;
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  }): Promise<{ id: string }> {
    const side = params.side === 'buy' ? 'BUY' : 'SELL';
    const price = parseFloat(String(params.price));
    const size = parseFloat(String(params.size));
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

    // Build mock services with a shared tick state object so both the
    // GammaClient (getTrending) and ClobClient (getOrderBook) read the
    // same current-snapshot data without desynchronizing.
    const orderManager = new BacktestOrderManager(config.capitalUsdc);
    const tickState = this.createTickState(snapshots);
    const gammaClient = this.createHistoricalGammaClient(tickState);
    const mockClob = this.createMockClob(tickState);

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

    // Replay ticks - advance tick state before each execute so strategies
    // see fresh market data on every call.
    for (let tickIdx = 0; tickIdx < snapshots.length; tickIdx++) {
      const snapshot = snapshots[tickIdx];
      tickState.setCurrent(snapshot);

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

  // ── Tick State ────────────────────────────────────────────────────────────

  /**
   * Shared mutable state that advances on every tick.
   * Both gamma client and clob client read from the same current snapshot.
   */
  private createTickState(snapshots: HistoricalSnapshot[]) {
    let current: HistoricalSnapshot | null = snapshots.length > 0 ? snapshots[0] : null;

    function snapshotToMarkets(snapshot: HistoricalSnapshot): GammaMarket[] {
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
    }

    return {
      /** Return GammaMarket[] for the current tick */
      getMarkets(): GammaMarket[] {
        if (!current) return [];
        return snapshotToMarkets(current);
      },
      /** Advance to the next snapshot */
      setCurrent(snapshot: HistoricalSnapshot): void {
        current = snapshot;
      },
    };
  }

  /**
   * Create a mock ClobClient that builds synthetic order books from the
   * current tick state.
   */
  private createMockClob(tickState: ReturnType<BacktestRunner['createTickState']>): ClobClient {
    return {
      async getOrderBook(tokenId: string): Promise<RawOrderBook> {
        const markets = tickState.getMarkets();
        const market = markets.find(
          (m) => m.yesTokenId === tokenId || m.noTokenId === tokenId,
        );
        if (!market) return { bids: [], asks: [], timestamp: 0 };

        const isYes = market.yesTokenId === tokenId;
        const price = isYes ? market.yesPrice : 1 - market.yesPrice;
        const ts = Date.now();

        // Build a plausible order book around the mid price
        const spread = 0.002; // ~0.2% spread
        const levels = 5;
        const bids: Array<{ price: string; size: string }> = [];
        const asks: Array<{ price: string; size: string }> = [];

        for (let i = 0; i < levels; i++) {
          const offset = (i + 1) * spread;
          bids.push({
            price: Math.max(0.001, price - offset).toFixed(4),
            size: String((Math.random() * 500 + 100).toFixed(0)),
          });
          asks.push({
            price: Math.min(0.999, price + offset).toFixed(4),
            size: String((Math.random() * 500 + 100).toFixed(0)),
          });
        }

        return { bids, asks, timestamp: ts };
      },
      async getPrice(tokenId: string): Promise<number> {
        const book = await this.getOrderBook(tokenId);
        if (book.bids.length === 0) return 0;
        const bestBid = parseFloat(book.bids[0].price);
        const bestAsk = parseFloat(book.asks[0].price);
        return (bestBid + bestAsk) / 2;
      },
      async getMidPrice(tokenId: string): Promise<number> {
        return this.getPrice(tokenId);
      },
    };
  }

  private createHistoricalGammaClient(tickState: ReturnType<BacktestRunner['createTickState']>): GammaClient {
    return {
      async getMarkets(): Promise<GammaMarket[]> {
        return tickState.getMarkets();
      },
      async getMarket(): Promise<GammaMarket | null> { return null; },
      async getMarketGroup(): Promise<null> { return null; },
      async searchMarkets(): Promise<GammaMarket[]> { return []; },
      async getTrending(_limit?: number): Promise<GammaMarket[]> {
        const markets = tickState.getMarkets();
        return markets.slice(0, _limit ?? 15);
      },
      async getEvents(): Promise<Array<{ id: string; title: string; slug: string; markets: GammaMarket[] }>> { return []; },
    };
  }
}
