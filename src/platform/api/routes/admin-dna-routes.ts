/**
 * Admin DNA Routes — Cheetahclaws-DNA engine lifecycle.
 * Mounted at /api/v1/admin/dna (admin tier only via X-Admin-Key header).
 *
 * POST /start      — start engine (with optional state hydration from DB)
 * POST /stop       — stop engine (persist state to DB)
 * POST /config     — update engine config (paper mode, TF weights, thresholds)
 * GET  /status     — engine state: last consensus, last regime, paper mode, running
 */
import { Router, Request, Response } from 'express';
import { logger } from '../../../shared/utils/logger';
import {
  startDnaEngine,
  stopDnaEngine,
  getDnaEngine,
  resetDnaEngine,
  DnaEngine,
} from'../../../desk/strategies/dna/orchestrator';
import { DnaEngineConfig, DnaLifecycleEvent } from '@desk/strategies/dna/multi-tf-types';
import type { CandleProvider } from'../../../desk/strategies/dna/orchestrator';
import { InMemoryStateStore } from'../../../desk/strategies/dna/dna-state-store';
import { requireAdminKey } from '../middleware/require-admin-key';

// Injected at server startup (src/api/server.ts sets this before listen).
let _provider: CandleProvider | null = null;
let _lastConfig: DnaEngineConfig | null = null;

export function setDnaProvider(provider: CandleProvider): void { _provider = provider; }
export function setDnaConfig(config: Partial<DnaEngineConfig>): void {
  _lastConfig = { ...(_lastConfig ?? {}), ...config } as DnaEngineConfig;
}

export function createAdminDnaRouter(): Router {
  const router = Router();

  /**
   * GET /status
   * Snapshot of current engine state — safe to call even if engine is stopped.
   */
  router.get('/status', (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const engine = getDnaEngine();
      const consensus = engine?.getLastConsensus() ?? null;
      const tfs = (engine as any)?._lastTfSignals
        ? Array.from((engine as any)._lastTfSignals as Iterable<[string, { action: string; confidence: number }]>).map(([tf, sig]) => ({ tf, action: sig.action, confidence: sig.confidence }))
        : [];
      res.json({
        running: engine?.isRunning ?? false,
        paperMode: engine?.paperMode ?? true,
        lastConsensus: consensus
          ? {
              traceId: consensus.traceId,
              action: consensus.action,
              confidence: consensus.confidence,
              weightedBullScore: consensus.weightedBullScore,
              weightedBearScore: consensus.weightedBearScore,
              reason: consensus.reason,
              
            }
          : null,
        lastTfSignals: tfs,
        config: _lastConfig,
        timestamp: Date.now(),
      });
    } catch (err) {
      logger.error('[AdminDna] status error', { err });
      res.status(500).json({ error: 'Failed to read DNA engine status' });
    }
  });

  /**
   * POST /start
   * Start (or restart) the DNA engine.
   * Body: { paperMode?: boolean, config?: Partial<DnaEngineConfig> }
   */
  router.post('/start', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const { paperMode, config } = req.body ?? {};
      if (!_provider) {
        return res.status(503).json({ error: 'DnaProvider not configured — call setDnaProvider at startup' });
      }
      const stateStore = new InMemoryStateStore();
      const engine = startDnaEngine(_provider, {
        paperMode: paperMode ?? true,
        ...(config ?? {}),
      });
      if (paperMode !== undefined) engine.setPaperMode(paperMode);
      res.json({ status: 'started', paperMode: engine.paperMode, running: engine.isRunning });
    } catch (err) {
      logger.error('[AdminDna] start error', { err });
      res.status(500).json({ error: 'Failed to start DNA engine' });
    }
  });

  /**
   * POST /stop
   * Stop the engine — state is persisted to DB via DnaStateStore.
   */
  router.post('/stop', (_req: Request, res: Response) => {
    if (!requireAdminKey(_req, res)) return;
    try {
      stopDnaEngine();
      res.json({ status: 'stopped', timestamp: Date.now() });
    } catch (err) {
      logger.error('[AdminDna] stop error', { err });
      res.status(500).json({ error: 'Failed to stop DNA engine' });
    }
  });

  /**
   * POST /reset
   * Hard reset — stop + clear state + start fresh.
   */
  router.post('/reset', (_req: Request, res: Response) => {
    if (!requireAdminKey(_req, res)) return;
    try {
      resetDnaEngine();
      res.json({ status: 'reset', timestamp: Date.now() });
    } catch (err) {
      logger.error('[AdminDna] reset error', { err });
      res.status(500).json({ error: 'Failed to reset DNA engine' });
    }
  });

  /**
   * POST /config
   * Hot-reload config (only accepts paperMode + conservative flags for safety).
   * Body: { paperMode?: boolean }
   */
  router.post('/config', (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const engine = getDnaEngine();
      if (!engine) return res.status(503).json({ error: 'DNA engine not running' });
      const { paperMode } = req.body ?? {};
      if (paperMode !== undefined) {
        engine.setPaperMode(paperMode);
        logger.info('[AdminDna] paper mode toggled', { paperMode });
      }
      res.json({ status: 'updated', paperMode: engine.paperMode });
    } catch (err) {
      logger.error('[AdminDna] config error', { err });
      res.status(500).json({ error: 'Failed to update DNA config' });
    }
  });

  return router;
}
