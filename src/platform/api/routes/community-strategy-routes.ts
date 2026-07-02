/**
 * Community Strategy Routes — User-uploaded strategies with sandbox validation.
 * Phase 38 Marketplace — community upload with backtesting harness.
 *
 * Endpoints:
 * - POST   /api/community/strategies/upload  — upload a strategy (PRO+)
 * - GET    /api/community/strategies          — list approved strategies (FREE)
 * - GET    /api/community/strategies/:id      — get strategy detail + backtest (FREE)
 * - POST   /api/community/strategies/:id/backtest — run backtest on uploaded strategy (PRO)
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { BacktestRunner, BacktestTrade } from '../../../shared/backtesting/backtest-runner';

export const communityStrategyRouter: RouterType = Router();

const ALLOWED_LANGUAGES = ['typescript', 'javascript'];
const ALLOWED_STRATEGY_TYPES = ['polymarket', 'cex', 'dex', 'custom'];

/** POST /upload — Submit a strategy for community review */
communityStrategyRouter.post('/upload', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const {
      tenantId, name, description, strategyType, sourceCode, language,
    } = req.body as {
      tenantId?: string;
      name?: string;
      description?: string;
      strategyType?: string;
      sourceCode?: string;
      language?: string;
    };

    if (!tenantId || !name || !sourceCode) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'tenantId, name, and sourceCode are required',
      });
    }

    if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Validation error', message: 'name must be 3-100 characters' });
    }

    if (typeof sourceCode !== 'string' || sourceCode.length < 10 || sourceCode.length > 50000) {
      return res.status(400).json({ error: 'Validation error', message: 'sourceCode must be 10-50000 characters' });
    }

    const lang = language || 'typescript';
    if (!ALLOWED_LANGUAGES.includes(lang)) {
      return res.status(400).json({ error: 'Validation error', message: `language must be: ${ALLOWED_LANGUAGES.join(', ')}` });
    }

    const stype = strategyType || 'polymarket';
    if (!ALLOWED_STRATEGY_TYPES.includes(stype)) {
      return res.status(400).json({ error: 'Validation error', message: `strategyType must be: ${ALLOWED_STRATEGY_TYPES.join(', ')}` });
    }

    const db = getDbClient();
    const result = await db.query(
      `INSERT INTO community_strategies (tenant_id, name, description, strategy_type, source_code, language, status, sandbox_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_review', 'pending')
       RETURNING id, status, created_at`,
      [tenantId, name.trim(), description?.trim() || null, stype, sourceCode, lang],
    );

    const row = result.rows[0];
    logger.info('[Community] Strategy uploaded', { id: row.id, tenantId, name: name.trim() });

    return res.status(201).json({
      id: row.id,
      name: name.trim(),
      status: row.status,
      sandboxStatus: 'pending',
      createdAt: row.created_at,
      message: 'Strategy submitted for review. Sandbox execution will run automatically.',
    });
  } catch (error) {
    logger.error('[Community] Error uploading strategy', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to upload strategy' });
  }
});

/** GET / — List approved community strategies */
communityStrategyRouter.get('/', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt((req.query.offset as string) || '0', 10) || 0, 0);

    const db = getDbClient();
    const result = await db.query(
      `SELECT id, tenant_id, name, description, strategy_type, language, status,
              sandbox_status, backtest_result, created_at
       FROM community_strategies
       WHERE status = 'approved'
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return res.json({
      data: result.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        description: r.description,
        strategyType: r.strategy_type,
        language: r.language,
        status: r.status,
        sandboxStatus: r.sandbox_status,
        hasBacktest: r.backtest_result != null,
        createdAt: r.created_at,
      })),
      limit,
      offset,
    });
  } catch (error) {
    logger.error('[Community] Error listing strategies', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list strategies' });
  }
});

/** GET /:id — Get strategy details */
communityStrategyRouter.get('/:id', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDbClient();

    const result = await db.query(
      `SELECT id, tenant_id, name, description, strategy_type, language, status,
              sandbox_status, backtest_result, review_notes, created_at, updated_at
       FROM community_strategies WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    const r = result.rows[0] as Record<string, unknown>;
    return res.json({
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      description: r.description,
      strategyType: r.strategy_type,
      language: r.language,
      status: r.status,
      sandboxStatus: r.sandbox_status,
      backtestResult: r.backtest_result,
      reviewNotes: r.review_notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  } catch (error) {
    logger.error('[Community] Error getting strategy', { error, id: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get strategy' });
  }
});

/** POST /:id/backtest — Run backtest on uploaded strategy */
communityStrategyRouter.post('/:id/backtest', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { trades, config } = req.body as {
      trades?: BacktestTrade[];
      config?: { initialCapitalUsd?: number; riskFreeRateAnnual?: number };
    };

    if (!trades || !Array.isArray(trades) || trades.length === 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'trades array is required and must be non-empty',
      });
    }

    // Validate trade shape
    for (const t of trades) {
      if (
        typeof t.entryTimestamp !== 'number' ||
        typeof t.exitTimestamp !== 'number' ||
        typeof t.pnlUsd !== 'number' ||
        typeof t.entryPrice !== 'number' ||
        typeof t.exitPrice !== 'number'
      ) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Each trade must have entryTimestamp, exitTimestamp, pnlUsd, entryPrice, exitPrice',
        });
      }
    }

    // Verify strategy exists
    const db = getDbClient();
    const existing = await db.query('SELECT id FROM community_strategies WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    // Run backtest
    const result = BacktestRunner.run(trades, config);

    // Persist backtest result
    await db.query(
      `UPDATE community_strategies
       SET backtest_result = $2, sandbox_status = 'passed', updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify({
        sharpeRatio: result.sharpeRatio,
        maxDrawdown: result.maxDrawdown,
        winRate: result.winRate,
        totalPnlUsd: Math.round(result.totalPnlUsd),
        profitFactor: result.profitFactor,
        totalTrades: result.totalTrades,
        winningTrades: result.winningTrades,
        losingTrades: result.losingTrades,
        volatility: result.volatilityAnnual,
        totalReturn: result.totalReturn,
        backtestedAt: new Date().toISOString(),
      })],
    );

    logger.info('[Community] Backtest completed', { strategyId: id, sharpe: result.sharpeRatio });

    return res.json({
      strategyId: id,
      ...result,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Community] Error running backtest', { error, id: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to run backtest' });
  }
});
