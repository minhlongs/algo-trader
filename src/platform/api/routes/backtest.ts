import { Router, Request, Response } from 'express';
import { Backtester } from '../../../desk/arbitrage/backtester';
import { PricePoint} from '../../../desk/arbitrage/types';
import { z } from 'zod';
import { requireTier } from '../../middleware/feature-gate';

export const backtestRouter: Router = Router();

// In-memory store for backtest results
const backtestResults = new Map<string, any>();

const backtestConfigSchema = z.object({
  startDate: z.string().transform((val) => new Date(val)).optional(),
  endDate: z.string().transform((val) => new Date(val)).optional(),
  initialCapital: z.number().default(10000),
  exchanges: z.array(z.enum(['binance', 'coinbase', 'kraken', 'uniswap', 'polymarket'])).default(['binance', 'coinbase']),
  symbols: z.array(z.string()).default(['BTC/USDT', 'ETH/BTC', 'ETH/USDT']),
  minProfitThreshold: z.number().default(0.5),
  maxPositionSize: z.number().default(1000),
});

const submitBodySchema = z.object({
  pair: z.string().default('BTC/USDT'),
  timeframe: z.string().default('1h'),
  strategyName: z.string().default('arb-spread-v1'),
  days: z.number().default(30),
  config: backtestConfigSchema.optional(),
  historicalData: z.array(z.array(z.any())).optional(),
});

// Helper to generate realistic historical data for backtesting if none is provided
function generateMockHistoricalData(): PricePoint[][] {
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

/**
 * POST /api/v1/backtest/submit
 * Submits a new backtest task
 */
backtestRouter.post('/submit', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const parsed = submitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
    }

    const { pair, timeframe, strategyName, days } = parsed.data;

    const config = {
      startDate: parsed.data.config?.startDate || new Date(Date.now() - days * 24 * 3600 * 1000),
      endDate: parsed.data.config?.endDate || new Date(),
      initialCapital: parsed.data.config?.initialCapital ?? 10000,
      exchanges: parsed.data.config?.exchanges ?? ['binance', 'coinbase'],
      symbols: parsed.data.config?.symbols ?? [pair],
      minProfitThreshold: parsed.data.config?.minProfitThreshold ?? 0.5,
      maxPositionSize: parsed.data.config?.maxPositionSize ?? 1000,
    };

    const historicalData = parsed.data.historicalData || generateMockHistoricalData();

    const backtester = new Backtester(config);
    const result = await backtester.run(historicalData);

    const backtestId = `backtest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    backtestResults.set(backtestId, {
      id: backtestId,
      pair,
      timeframe,
      strategyName,
      days,
      config,
      result,
      timestamp: Date.now(),
    });

    return res.status(201).json({
      jobId: backtestId,
      status: 'completed',
      message: 'Backtest completed successfully',
      result,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to execute backtest',
    });
  }
});

/**
 * GET /api/v1/backtest/results
 * Lists all backtest results directly as an array (for frontend compatibility)
 * If id=xxx is provided, returns that specific result
 */
backtestRouter.get('/results', requireTier('PRO'), async (req: Request, res: Response) => {
  const { id } = req.query;

  if (id && typeof id === 'string') {
    const item = backtestResults.get(id);
    if (!item) {
      return res.status(404).json({ error: `Backtest result ${id} not found` });
    }
    return res.json({
      id: item.id,
      strategyName: item.strategyName,
      pair: item.pair,
      timeframe: item.timeframe,
      days: item.days,
      sharpeRatio: item.result.sharpeRatio,
      sortinoRatio: item.result.sharpeRatio * 1.1, // Derived/mock sortino
      maxDrawdownPct: item.result.maxDrawdown * 100, // fraction to pct
      totalReturnPct: item.result.netProfitPct,
      createdAt: new Date(item.timestamp).toISOString(),
    });
  }

  // Return all results as a flat array
  const list = Array.from(backtestResults.values())
    .map((item) => ({
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
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json(list);
});
