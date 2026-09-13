/**
 * Health Routes
 * GET /health - Health check with component status, version, memory
 * GET /health/metrics - Detailed system metrics (JSON)
 */

import { Router, Request, Response } from 'express';
import { getRedisClient } from '../../../redis';
import { getDbClient } from '../../../shared/db/postgres-client';
import { TradingEngine } from '../../../desk/engine';
import { isQwenEnabled, isKillSwitchActive } from '../../../desk/wiring/qwen-drawdown-monitor';
import { handleReadinessCheck } from './health-readiness';
import { collectRedisMetrics, getDiskUsageSnapshot } from './health-metrics-collector';

// Resolve package version at module load time — avoids repeated disk reads
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: APP_VERSION } = require('../../../../package.json') as { version: string };

export const healthRouter: Router = Router();

/**
 * GET /health
 * Returns liveness + readiness status
 */
healthRouter.get('/', async (req: Request, res: Response) => {
  // --- Redis ---
  let redisStatus: 'ok' | 'error' = 'ok';
  let redisError: string | undefined;
  try {
    const redis = getRedisClient();
    await redis.ping();
  } catch (err) {
    redisStatus = 'error';
    redisError = err instanceof Error ? err.message : 'Redis ping failed';
  }

  // --- PostgreSQL (optional — may not be provisioned in all envs) ---
  let postgresStatus: 'ok' | 'error' | 'disconnected' = 'disconnected';
  try {
    const db = getDbClient();
    await db.query('SELECT 1');
    postgresStatus = 'ok';
  } catch {
    postgresStatus = 'error';
  }

  // --- Trading engine: lightweight in-process check ---
  let tradingEngineStatus: 'ok' | 'error' = 'ok';
  try {
    const engine = new TradingEngine();
    if (!Array.isArray(engine.getOrders())) {
      throw new Error('Unexpected engine state');
    }
  } catch {
    tradingEngineStatus = 'error';
  }

  // --- Paper trading flag ---
  const isPaperTrading = process.env['DRY_RUN'] === 'true';

  // --- Qwen rollback state (booleans only — no sensitive numbers) ---
  const qwen = {
    enabled: isQwenEnabled(),
    killSwitchActive: isKillSwitchActive(),
  };

  // --- Disk usage (optional — not available in all Node.js runtimes) ---
  const diskUsage = getDiskUsageSnapshot();

  // --- Risk engine ---
  const riskEngineEnabled = process.env['ENABLE_RISK_ENGINE'] === 'true';

  // --- Kronos (AI Validation) ---
  const kronosEnabled = process.env['AI_VALIDATION_ENABLED'] === 'true';

  // --- Memory snapshot ---
  const mem = process.memoryUsage();
  const memMb = {
    rss: +(mem.rss / 1024 / 1024).toFixed(1),
    heapUsed: +(mem.heapUsed / 1024 / 1024).toFixed(1),
    heapTotal: +(mem.heapTotal / 1024 / 1024).toFixed(1),
  };

  // Overall status: healthy only when redis AND postgres are ok
  const overallStatus = redisStatus === 'ok' && postgresStatus === 'ok' ? 'healthy' : 'unhealthy';
  const httpCode = overallStatus === 'healthy' ? 200 : 503;

  return res.status(httpCode).json({
    status: overallStatus,
    version: APP_VERSION,
    uptime: +process.uptime().toFixed(2),
    paperTrading: isPaperTrading,
    components: {
      redis: redisStatus,
      postgres: postgresStatus,
      tradingEngine: tradingEngineStatus,
      ...(redisError ? { redisError } : {}),
    },
    qwen,
    ...(diskUsage ? { disk: diskUsage } : {}),
    riskEngine: riskEngineEnabled,
    kronos: kronosEnabled,
    memory: memMb,
    timestamp: Date.now(),
  });
});

/**
 * GET /ready
 * Startup readiness probe — Kubernetes / load-balancer compatible.
 */
healthRouter.get('/ready', handleReadinessCheck);

/**
 * GET /health/metrics
 * Detailed system metrics in JSON format (for dashboards / Grafana)
 */
healthRouter.get('/metrics', async (req: Request, res: Response) => {
  const redis = getRedisClient();
  const redisMetrics = await collectRedisMetrics(redis);

  res.json({
    version: APP_VERSION,
    redis: redisMetrics,
    process: {
      memory_usage: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
      uptime: process.uptime(),
      node_version: process.version,
      platform: process.platform,
      pid: process.pid,
    },
    timestamp: Date.now(),
  });
});
