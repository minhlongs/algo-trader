/**
 * Community Strategy Routes — User-uploaded strategies with sandbox validation.
 * Phase 38 Marketplace — community upload with backtesting harness.
 *
 * Endpoints:
 * - POST   /api/community/strategies/upload  — upload a strategy (PRO+)
 * - GET    /api/community/strategies          — list approved strategies (FREE)
 * - GET    /api/community/strategies/:id      — get strategy detail + backtest (FREE)
 * - POST   /api/community/strategies/:id/backtest — run backtest on uploaded strategy (PRO)
 *
 * KNOWN GAP: No isolated live execution sandbox for community strategies.
 * Currently sandbox_status is a passive DB column (pending/passed/failed) updated
 * only by the backtest endpoint. There is no containerized or VM-isolated runtime
 * that executes uploaded community strategy code in a live market feed environment
 * with resource limits, DLP attestation, or kill-switch enforcement. The RaaS
 * subscriber-executor (src/platform/raas/subscriber-executor.ts) provides tenant-
 * isolated execution for official marketplace strategies, but community-uploaded
 * strategies bypass this entirely — they are only backtested, never live-executed
 * in isolation. This is a security and reliability gap for community-contributed
 * strategies intended for live trading.
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { registerReadRoutes } from './community-strategy-read-routes';
import { registerBacktestRoute } from './community-strategy-backtest-route';
import { ALLOWED_LANGUAGES, ALLOWED_STRATEGY_TYPES } from './community-strategy-types';

export const communityStrategyRouter: RouterType = Router();

// Re-exports for consumers
export type { UploadStrategyBody, BacktestRequestBody } from './community-strategy-types';
export { ALLOWED_LANGUAGES, ALLOWED_STRATEGY_TYPES };

/** POST /upload — Submit a strategy for community review */
communityStrategyRouter.post('/upload', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const { tenantId, name, description, strategyType, sourceCode, language } = req.body as {
      tenantId?: string; name?: string; description?: string;
      strategyType?: string; sourceCode?: string; language?: string;
    };

    if (!tenantId || !name || !sourceCode) {
      return res.status(400).json({ error: 'Validation error', message: 'tenantId, name, and sourceCode are required' });
    }
    if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Validation error', message: 'name must be 3-100 characters' });
    }
    if (typeof sourceCode !== 'string' || sourceCode.length < 10 || sourceCode.length > 50000) {
      return res.status(400).json({ error: 'Validation error', message: 'sourceCode must be 10-50000 characters' });
    }
    const lang = language || 'typescript';
    if (!ALLOWED_LANGUAGES.includes(lang as typeof ALLOWED_LANGUAGES[number])) {
      return res.status(400).json({ error: 'Validation error', message: `language must be: ${ALLOWED_LANGUAGES.join(', ')}` });
    }
    const stype = strategyType || 'polymarket';
    if (!ALLOWED_STRATEGY_TYPES.includes(stype as typeof ALLOWED_STRATEGY_TYPES[number])) {
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
      id: row.id, name: name.trim(), status: row.status, sandboxStatus: 'pending',
      createdAt: row.created_at, message: 'Strategy submitted for review. Sandbox execution will run automatically.',
    });
  } catch (error) {
    logger.error('[Community] Error uploading strategy', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to upload strategy' });
  }
});

// Register sub-route handlers
registerReadRoutes(communityStrategyRouter);
registerBacktestRoute(communityStrategyRouter);
