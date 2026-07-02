/**
 * Positions Routes
 * POST /api/positions/:id/close — Close a specific position by ID
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PositionManager } from '../../../desk/risk/position-manager';
import { requireTier } from '../../middleware/feature-gate';
import { logger } from '../../../shared/utils/logger';

export const positionsRouter: Router = Router();

const closePositionSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  exchange: z.string().min(1, 'Exchange is required'),
  exitPrice: z.number().positive('Exit price must be positive'),
});

/**
 * POST /api/positions/:id/close
 * Close a position by its identifier.
 * Expects body: { symbol, exchange, exitPrice }
 */
positionsRouter.post('/:id/close', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!id || id.trim().length === 0) {
      return res.status(400).json({ error: 'Position ID is required' });
    }

    const parsed = closePositionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid request body',
      });
    }

    const { symbol, exchange, exitPrice } = parsed.data;
    const positionManager = new PositionManager();

    const pnl = await positionManager.closePosition(symbol, exchange, exitPrice);

    logger.info('[Positions] Close requested', { id, symbol, exchange, exitPrice, pnl });

    res.json({ success: true, id, pnl });
  } catch (error) {
    logger.error('[Positions] Close failed', { error: String(error) });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to close position',
    });
  }
});
