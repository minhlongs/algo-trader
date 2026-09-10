/**
 * Risk API Portfolio Routes
 * Portfolio-level risk metrics: VaR, correlation, drawdown, cache
 */

import type { Router, Request, Response } from 'express';
import type { RiskEngine } from '../../risk/risk-engine';
import { requireTier } from '../../middleware/feature-gate';
import { logger } from '../../../shared/utils/logger';
import {
  varRequestSchema,
  correlationRequestSchema,
  drawdownAlertSchema,
} from './risk-routes-schemas';
import { checkEnabled, getUserId } from './risk-routes-common';

export function registerPortfolioRoutes(router: Router, riskEngine: RiskEngine): void {
  router.post(
    '/var',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        const parsed = varRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.issues[0]?.message });
        }

        const vaRInput = {
          ...parsed.data,
          confidence: parsed.data.confidence === '0.99' ? 0.99 : 0.95,
        } as Parameters<typeof riskEngine.computeVaR>[0];
        const result = await riskEngine.computeVaR(vaRInput, getUserId(req));
        res.json(result);
      } catch (error) {
        logger.error('[RiskRoutes] VaR computation failed', { error: String(error) });
        res.status(500).json({ error: 'VaR computation failed' });
      }
    },
  );

  router.post(
    '/correlation',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        const parsed = correlationRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.issues[0]?.message });
        }

        const result = await riskEngine.computeCorrelation(parsed.data, getUserId(req));
        res.json(result);
      } catch (error) {
        logger.error('[RiskRoutes] Correlation failed', { error: String(error) });
        res.status(500).json({ error: 'Correlation computation failed' });
      }
    },
  );

  router.get(
    '/drawdown',
    checkEnabled,
    requireTier('FREE'),
    async (req: Request, res: Response) => {
      try {
        const result = await riskEngine.getDrawdownStatus(getUserId(req));
        res.json(result);
      } catch (error) {
        logger.error('[RiskRoutes] Drawdown status failed', { error: String(error) });
        res.status(500).json({ error: 'Drawdown status unavailable' });
      }
    },
  );

  router.post(
    '/drawdown/alert',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        const parsed = drawdownAlertSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.issues[0]?.message });
        }

        const thresholds = { daily: parsed.data.dailyThreshold, total: parsed.data.totalThreshold };
        const result = await riskEngine.checkDrawdownAlerts(getUserId(req), thresholds);
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('[RiskRoutes] Drawdown alert failed', { error: String(error) });
        res.status(500).json({ error: 'Drawdown alert check failed' });
      }
    },
  );

  router.delete(
    '/cache',
    checkEnabled,
    requireTier('PRO'),
    async (req: Request, res: Response) => {
      try {
        await riskEngine.invalidateUserCache(getUserId(req));
        res.json({ success: true, message: 'Risk cache invalidated' });
      } catch (error) {
        logger.error('[RiskRoutes] Cache invalidation failed', { error: String(error) });
        res.status(500).json({ error: 'Cache invalidation failed' });
      }
    },
  );
}
