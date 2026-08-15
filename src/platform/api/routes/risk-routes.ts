/**
 * Risk API Routes — /api/v1/risk/*
 *
 * Exposes portfolio risk metrics via REST endpoints:
 *   POST  /api/v1/risk/var              — VaR/CVaR computation
 *   POST  /api/v1/risk/correlation      — Correlation matrix
 *   GET   /api/v1/risk/drawdown         — Drawdown status + alerts
 *   POST  /api/v1/risk/drawdown/alert   — Trigger drawdown alert check
 *   POST  /api/v1/risk/atr/stop         — ATR trailing stop computation
 *   GET   /api/v1/risk/atr/stop/:symbol — Get stored ATR state
 *   DELETE /api/v1/risk/atr/stop/:symbol — Clear ATR state (position close)
 *   POST  /api/v1/risk/kelly/size       — Kelly position sizing
 *   POST  /api/v1/risk/kelly/from-history — Kelly from trade history
 *   DELETE /api/v1/risk/cache           — Invalidate user risk cache
 */

import { Router, Request, Response, type NextFunction } from 'express';
import { z } from 'zod';
import { RiskEngine } from '../../risk/risk-engine';
import { RISK_FEATURE_FLAG, type RiskPosition } from '../../risk/types';
import { requireTier } from '../../middleware/feature-gate';
import { logger } from '../../../shared/utils/logger';

export const riskRouter: Router = Router();

const riskEngine = new RiskEngine();

// ── Schemas ───────────────────────────────────────────────────────────────────

const positionSchema = z.object({
  symbol: z.string().min(1),
  currentValue: z.number().positive(),
  side: z.enum(['long', 'short']).default('long'),
  returns: z.array(z.number()),
  dailyVolatility: z.number().nonnegative().optional(),
});

const varRequestSchema = z.object({
  positions: z.array(positionSchema).min(1).max(50),
  confidence: z.enum(['0.95', '0.99']).default('0.95'),
  horizonDays: z.number().int().positive().max(365).default(1),
  method: z.enum(['parametric', 'historical', 'both']).default('both'),
});

const correlationRequestSchema = z.object({
  positions: z.array(
    z.object({
      symbol: z.string().min(1),
      returns: z.array(z.number()),
    }),
  ).min(2).max(50),
});

const drawdownAlertSchema = z.object({
  dailyThreshold: z.number().min(0).max(1).optional(),
  totalThreshold: z.number().min(0).max(1).optional(),
  maxConsecutiveLosses: z.number().int().positive().optional(),
});

const atrStopSchema = z.object({
  symbol: z.string().min(1),
  candles: z.array(
    z.object({
      high: z.number(),
      low: z.number(),
      close: z.number(),
    }),
  ).min(15),
  direction: z.enum(['long', 'short']),
  period: z.number().int().min(2).max(100).default(14),
  multiplier: z.number().positive().default(2.0),
});

const kellySchema = z.object({
  winProbability: z.number().min(0).max(1),
  winLossRatio: z.number().positive(),
  portfolioValue: z.number().positive(),
  correlation: z.number().min(-1).max(1).default(0),
  currentExposure: z.number().nonnegative().default(0),
  kellyFraction: z.number().min(0.1).max(0.5).optional(),
});

const kellyHistorySchema = z.object({
  tradeReturns: z.array(z.number()).min(1),
  portfolioValue: z.number().positive(),
  correlation: z.number().min(-1).max(1).default(0),
  kellyFraction: z.number().min(0.1).max(0.5).optional(),
});

// ── Feature flag check ────────────────────────────────────────────────────────

function checkEnabled(req: Request, res: Response, next: NextFunction) {
  if (process.env[RISK_FEATURE_FLAG] !== 'true') {
    return res.status(503).json({
      error: 'Risk engine disabled',
      flag: RISK_FEATURE_FLAG,
      message: 'Set ENABLE_RISK_ENGINE=true to enable risk endpoints',
    });
  }
  next();
}

// ── Helper: extract userId from request ──────────────────────────────────────

function getUserId(req: Request): string {
  // Auth middleware attaches user; fall back to a default for public endpoints
  return (req as unknown as Record<string, { id?: string }>).user?.id
    || (req as unknown as Record<string, { userId?: string }>).auth?.userId
    || 'anonymous';
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/risk/var
 * Compute VaR and CVaR for a portfolio.
 * Body: { positions, confidence, horizonDays, method }
 */
riskRouter.post(
  '/var',
  checkEnabled,
  requireTier('PRO'),
  async (req: Request, res: Response) => {
    try {
      const parsed = varRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message });
      }

      const vaRInput = { ...parsed.data, confidence: parsed.data.confidence === '0.99' ? 0.99 : 0.95 } as Parameters<typeof riskEngine.computeVaR>[0]; const result = await riskEngine.computeVaR(vaRInput, getUserId(req));
      res.json(result);
    } catch (error) {
      logger.error('[RiskRoutes] VaR computation failed', { error: String(error) });
      res.status(500).json({ error: 'VaR computation failed' });
    }
  },
);

/**
 * POST /api/v1/risk/correlation
 * Compute correlation matrix across positions.
 */
riskRouter.post(
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

/**
 * GET /api/v1/risk/drawdown
 * Get current drawdown metrics + 24h history.
 */
riskRouter.get(
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

/**
 * POST /api/v1/risk/drawdown/alert
 * Check drawdown thresholds and fire alerts if breached.
 */
riskRouter.post(
  '/drawdown/alert',
  checkEnabled,
  requireTier('PRO'),
  async (req: Request, res: Response) => {
    try {
      const parsed = drawdownAlertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message });
      }

      const thresholds: { daily?: number; total?: number } = { daily: parsed.data.dailyThreshold, total: parsed.data.totalThreshold }; const result = await riskEngine.checkDrawdownAlerts(getUserId(req), thresholds);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('[RiskRoutes] Drawdown alert failed', { error: String(error) });
      res.status(500).json({ error: 'Drawdown alert check failed' });
    }
  },
);

/**
 * POST /api/v1/risk/atr/stop
 * Compute ATR trailing stop for a position.
 */
riskRouter.post(
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

/**
 * GET /api/v1/risk/atr/stop/:symbol
 * Get stored ATR state for a position.
 */
riskRouter.get(
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

/**
 * DELETE /api/v1/risk/atr/stop/:symbol
 * Clear ATR state (call when position is closed).
 */
riskRouter.delete(
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

/**
 * POST /api/v1/risk/kelly/size
 * Calculate position size from Kelly criterion inputs.
 */
riskRouter.post(
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

/**
 * POST /api/v1/risk/kelly/from-history
 * Derive Kelly inputs from trade returns.
 */
riskRouter.post(
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

/**
 * DELETE /api/v1/risk/cache
 * Invalidate all cached risk metrics for the current user.
 */
riskRouter.delete(
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
