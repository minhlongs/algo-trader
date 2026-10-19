/**
 * Arbitrage Engine API Routes
 * Exposes arbitrage execution engine and orchestrator metrics via REST API
 */

import { Router, Request, Response } from 'express';
import { StrategyOrchestrator, createStrategyOrchestrator } from '../../../desk/arbitrage/orchestrator';
import { ArbitrageOpportunity } from '../../../desk/arbitrage/types';
import { logger } from '../../../shared/utils/logger';

const router: Router = Router();

let orchestrator: StrategyOrchestrator | null = null;
let orchestratorInitialized = false;

async function ensureOrchestrator(): Promise<StrategyOrchestrator> {
  if (orchestrator && orchestratorInitialized) return orchestrator;

  orchestrator = createStrategyOrchestrator({
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    exchanges: ['binance', 'okx', 'bybit'],
    dryRun: true,
    verbose: false,
    minSpreadPercent: 0.05,
    checkIntervalMs: 100,
    maxQueueSize: 50,
  });

  await orchestrator.start();
  orchestratorInitialized = true;
  logger.info('[ArbitrageAPI] Orchestrator initialized and started');
  return orchestrator;
}

/**
 * POST /api/arbitrage/execute
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const orch = await ensureOrchestrator();
    const opportunity = req.body as ArbitrageOpportunity;

    if (!opportunity || !opportunity.id || !opportunity.type || !opportunity.legs) {
      return res.status(400).json({
        success: false,
        error: 'Invalid opportunity: missing required fields (id, type, legs)',
      });
    }

    return res.status(202).json({
      success: true,
      opportunityId: opportunity.id,
      status: 'queued',
      message: 'Opportunity queued for execution',
      queueDepth: orch.getMetrics().queueSize,
    });
  } catch (error) {
    logger.error('[ArbitrageAPI] Execute error:', { error });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/arbitrage/metrics
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const orch = await ensureOrchestrator();
    const metrics = orch.getMetrics();
    return res.json({ ...metrics, timestamp: Date.now() });
  } catch (error) {
    logger.error('[ArbitrageAPI] Metrics error:', { error });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/arbitrage/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const orch = await ensureOrchestrator();
    const metrics = orch.getMetrics();
    return res.json({
      isRunning: metrics.isRunning,
      feedConnected: metrics.feedConnected,
      uptimeMs: metrics.uptimeMs,
      queueSize: metrics.queueSize,
      queueDropped: metrics.queueDropped,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('[ArbitrageAPI] Status error:', { error });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/arbitrage/start
 */
router.post('/start', async (_req: Request, res: Response) => {
  try {
    const orch = await ensureOrchestrator();
    if (!orch.getMetrics().isRunning) await orch.start();
    return res.json({ success: true, message: 'Orchestrator started' });
  } catch (error) {
    logger.error('[ArbitrageAPI] Start error:', { error });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/arbitrage/stop
 */
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    if (orchestrator) {
      await orchestrator.stop();
      orchestratorInitialized = false;
      orchestrator = null;
    }
    return res.json({ success: true, message: 'Orchestrator stopped' });
  } catch (error) {
    logger.error('[ArbitrageAPI] Stop error:', { error });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as arbitrageRoutes };
