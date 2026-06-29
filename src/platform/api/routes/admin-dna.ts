/**
 * Admin Routes — DNA Engine
 *
 * GET  /admin/dna/status         — engine state (running, paperMode, lastTick, lastConsensus)
 * GET  /admin/dna/journal        — recent paper journal entries (paginated)
 * POST /admin/dna/paper-mode     — toggle paper mode { enabled: true|false }
 * POST /admin/dna/journal/clear  — wipe in-memory paper journal (dev/debug)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { requireAdminKey } from '../middleware/require-admin-key.js';

import { getDnaEngine, onDnaEvent, emitDnaEvent } from '../../../desk/strategies/dna/orchestrator.js';
import { getPaperJournal, clearPaperJournal } from '../../../desk/strategies/dna/paper-executor.js';

const router: Router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────────

function engineOrError(res: Response): ReturnType<typeof getDnaEngine> {
  const engine = getDnaEngine();
  if (!engine) {
    res.status(503).json({ error: 'DNA engine not started' });
    return null;
  }
  return engine;
}

// ─── GET /admin/dna/status ─────────────────────────────────────────────────────

router.get('/status', async (_req: Request, res: Response) => {
  if (!requireAdminKey(_req, res)) return;
  const engine = engineOrError(res);
  if (!engine) return;

  const consensus = engine.getLastConsensus();
  res.json({
    running: engine.isRunning,
    paperMode: engine.paperMode,
    lastConsensus: consensus
      ? {
          traceId: consensus.traceId,
          action: consensus.action,
          confidence: consensus.confidence,
          regime: consensus.regime,
          emittedAt: consensus.emittedAt,
        }
      : null,
  });
});

// ─── GET /admin/dna/journal ────────────────────────────────────────────────────

const journalQuery = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
});

router.get('/journal', async (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  const parsed = journalQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const entries = getPaperJournal().slice(-parsed.data.limit).reverse();
  res.json({ entries, count: entries.length });
});

// ─── POST /admin/dna/paper-mode ───────────────────────────────────────────────

const paperModeSchema = z.object({ enabled: z.boolean() });

router.post('/paper-mode', async (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  const engine = engineOrError(res);
  if (!engine) return;

  const parsed = paperModeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { enabled } = parsed.data;
  engine.setPaperMode(enabled);

  emitDnaEvent({
    type: 'tick',
    tf: '1d',
    at: Date.now(),
  });

  res.json({ paperMode: engine.paperMode, message: `paper_mode → ${enabled}` });
});

// ─── POST /admin/dna/journal/clear ────────────────────────────────────────────

router.post('/journal/clear', async (_req: Request, res: Response) => {
  if (!requireAdminKey(_req, res)) return;
  clearPaperJournal();
  res.json({ ok: true, message: 'paper journal cleared' });
});

// ─── Register ──────────────────────────────────────────────────────────────────

export { router as adminDnaRouter };
