/**
 * Risk API Trading Routes
 * Position and trade-level risk metrics: ATR trailing stops, Kelly sizing
 */

import type { Router, Request, Response } from 'express';
import type { RiskEngine } from '../../risk/risk-engine';
import { requireTier } from '../../middleware/feature-gate';
import { logger } from '../../../shared/utils/logger';
import {
  atrStopSchema,
  kellySchema,
  kellyHistorySchema,
} from './risk-routes-schemas';
import { checkEnabled, getUserId } from './risk-routes-common';

export function registerTradingRoutes(router: Router, riskEngine: RiskEngine): void {
  router.post(
    '/atr/stop',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        const parsed = atrStopSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.issues[0]?.message });
        }

        const result = riskEngine.computeAtrStop(parsed.data);
        res.json(result);
      } catch (error) {
        logger.error('[RiskRoutes] ATR stop failed', { error: String(error) });
        res.status(500).json({ error: 'ATR stop computation failed' });
      }
    },
  );

  router.get(
    '/atr/stop/:symbol',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        const symbol = req.params.symbol;
        if (!symbol) {
          return res.status(400).json({ error: 'Symbol is required' });
        }

        const state = await riskEngine.getAtrState(getUserId(req), symbol as string);
        if (!state) {
          return res.status(404).json({ error: 'No ATR state found for this symbol' });
        }

        res.json({ success: true, data: state });
      } catch (error) {
        logger.error('[RiskRoutes] ATR state fetch failed', { error: String(error) });
        res.status(500).json({ error: 'Failed to fetch ATR state' });
      }
    },
  );

  router.delete(
    '/atr/stop/:symbol',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        const symbol = req.params.symbol;
        if (!symbol) {
          return res.status(400).json({ error: 'Symbol is required' });
        }

        await riskEngine.clearAtrState(getUserId(req), symbol as string);
        res.json({ success: true, message: `ATR state cleared for ${symbol}` });
      } catch (error) {
        logger.error('[RiskRoutes] ATR state clear failed', { error: String(error) });
        res.status(500).json({ error: 'Failed to clear ATR state' });
      }
    },
  );

  router.post(
    '/kelly/size',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        const parsed = kellySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.issues[0]?.message });
        }

        const result = riskEngine.calculateKelly(parsed.data, getUserId(req));
        res.json(result);
      } catch (error) {
        logger.error('[RiskRoutes] Kelly sizing failed', { error: String(error) });
        res.status(500).json({ error: 'Kelly sizing computation failed' });
      }
    },
  );

  router.post(
    '/kelly/from-history',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        const parsed = kellyHistorySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.issues[0]?.message });
        }

        const result = await riskEngine.kellyFromTradeHistory(
          getUserId(req),
          parsed.data.tradeReturns,
          parsed.data.portfolioValue,
          parsed.data.correlation,
        );
        res.json(result);
      } catch (error) {
        logger.error('[RiskRoutes] Kelly from history failed', { error: String(error) });
        res.status(500).json({ error: 'Kelly from history failed' });
      }
    },
  );
}
