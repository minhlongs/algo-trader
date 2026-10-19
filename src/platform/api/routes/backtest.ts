import { Router, Request, Response } from 'express';
import { Backtester } from '../../../desk/arbitrage/backtester';
import { PricePoint } from '../../../desk/arbitrage/types';
import {
  type StoredBacktestResult,
  backtestConfigSchema,
  submitBodySchema,
  generateMockHistoricalData,
  formatStoredBacktestSummary,
} from './backtest-helpers';

export {
  type StoredBacktestResult,
  backtestConfigSchema,
  submitBodySchema,
  generateMockHistoricalData,
  formatStoredBacktestSummary,
};

export const backtestRouter: Router = Router();

// In-memory store for backtest results
const backtestResults = new Map<string, StoredBacktestResult>();

/**
 * POST /api/v1/backtest/submit
 * Submits a new backtest task
 */
backtestRouter.post('/submit', async (req: Request, res: Response) => {
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

    const historicalData = (parsed.data.historicalData as unknown as PricePoint[][]) || generateMockHistoricalData();

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
backtestRouter.get('/results', async (req: Request, res: Response) => {
  const { id } = req.query;

  if (id && typeof id === 'string') {
    const item = backtestResults.get(id);
    if (!item) {
      return res.status(404).json({ error: `Backtest result ${id} not found` });
    }
    return res.json(formatStoredBacktestSummary(item));
  }

  // Return all results as a flat array
  const list = Array.from(backtestResults.values())
    .map(formatStoredBacktestSummary)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json(list);
});
