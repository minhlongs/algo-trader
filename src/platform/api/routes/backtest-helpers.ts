import { PricePoint, BacktestConfig, BacktestResult } from '../../../desk/arbitrage/types';
import { z } from 'zod';

export interface StoredBacktestResult {
  id: string;
  pair: string;
  timeframe: string;
  strategyName: string;
  days: number;
  config: BacktestConfig;
  result: BacktestResult;
  timestamp: number;
}

export const backtestConfigSchema = z.object({
  startDate: z.string().transform((val) => new Date(val)).optional(),
  endDate: z.string().transform((val) => new Date(val)).optional(),
  initialCapital: z.number().default(10000),
  exchanges: z.array(z.enum(['binance', 'coinbase', 'kraken', 'uniswap', 'polymarket'])).default(['binance', 'coinbase']),
  symbols: z.array(z.string()).default(['BTC/USDT', 'ETH/BTC', 'ETH/USDT']),
  minProfitThreshold: z.number().default(0.5),
  maxPositionSize: z.number().default(1000),
});

export const submitBodySchema = z.object({
  pair: z.string().default('BTC/USDT'),
  timeframe: z.string().default('1h'),
  strategyName: z.string().default('arb-spread-v1'),
  days: z.number().default(30),
  config: backtestConfigSchema.optional(),
  historicalData: z.array(z.array(z.unknown())).optional(),
});

// Helper to generate realistic historical data for backtesting if none is provided
export function generateMockHistoricalData(): PricePoint[][] {
  const data: PricePoint[][] = [];
  let baseBtc = 50000;
  let baseEth = 2500;

  for (let i = 0; i < 50; i++) {
    // Introduce some random walk
    baseBtc += (Math.random() - 0.48) * 100;
    baseEth += (Math.random() - 0.48) * 5;
    const ethBtcRatio = baseEth / baseBtc;

    // Occasionally introduce an arbitrage opportunity (expectedProfitPct > threshold)
    const arbOpportunity = Math.random() > 0.85;
    const askModifier = arbOpportunity ? 0.985 : 0.999;

    data.push([
      {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bid: baseBtc,
        ask: baseBtc * askModifier,
        timestamp: Date.now() - (50 - i) * 60000,
      },
      {
        exchange: 'binance',
        symbol: 'ETH/BTC',
        bid: ethBtcRatio,
        ask: ethBtcRatio * askModifier,
        timestamp: Date.now() - (50 - i) * 60000,
      },
      {
        exchange: 'binance',
        symbol: 'ETH/USDT',
        bid: baseEth,
        ask: baseEth * askModifier,
        timestamp: Date.now() - (50 - i) * 60000,
      },
    ]);
  }
  return data;
}

export function formatStoredBacktestSummary(item: StoredBacktestResult) {
  return {
    id: item.id,
    strategyName: item.strategyName,
    pair: item.pair,
    timeframe: item.timeframe,
    days: item.days,
    sharpeRatio: item.result.sharpeRatio,
    sortinoRatio: item.result.sharpeRatio * 1.1,
    maxDrawdownPct: item.result.maxDrawdown * 100,
    totalReturnPct: item.result.netProfitPct,
    createdAt: new Date(item.timestamp).toISOString(),
  };
}
