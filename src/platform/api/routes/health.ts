/**
 * Health Routes
 * GET /health - Health check with component status, version, memory
 * GET /health/metrics - Detailed system metrics (JSON)
 * GET /metrics - Prometheus-format metrics
 */

import { Router, Request, Response } from 'express';
import { getRedisClient } from '../../../redis';
import { getDbClient } from '../../../shared/db/postgres-client';
import { TradingEngine } from '../../../desk/engine';
import { isQwenEnabled, isKillSwitchActive } from '../../../desk/wiring/qwen-drawdown-monitor';

// Resolve package version at module load time — avoids repeated disk reads
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: APP_VERSION } = require('../../../../package.json') as { version: string };

export const healthRouter: Router = Router();

/**
 * GET /health
 *
 * Returns liveness + readiness status with:
 * - Component health (redis, postgres, trading engine)
 * - Paper trading mode flag (DRY_RUN env)
 * - App version, uptime, memory snapshot
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
  // Instantiate a throwaway engine instance to verify the class is functional
  let tradingEngineStatus: 'ok' | 'error' = 'ok';
  try {
    const engine = new TradingEngine();
    // Verify basic functionality: an empty orders list is expected
    if (!Array.isArray(engine.getOrders())) {
      throw new Error('Unexpected engine state');
    }
  } catch {
    tradingEngineStatus = 'error';
  }

  // --- Paper trading flag ---
  const isPaperTrading = process.env['DRY_RUN'] === 'true';

  // --- Qwen rollback state (booleans only — no sensitive numbers) ---
  // Unauthenticated readout for uptime monitors and CLI ops (`curl /health | jq .qwen`).
  // Detailed state with P&L / days-remaining lives behind admin-key at /admin/qwen/status.
  const qwen = {
    enabled: isQwenEnabled(),
    killSwitchActive: isKillSwitchActive(),
  };

  // --- Disk usage (optional — not available in all Node.js runtimes) ---
  let diskUsage: { total: number; used: number; free: number } | undefined;
  try {
    const diskFn = (process as unknown as Record<string, unknown>)['diskUsage'];
    if (typeof diskFn === 'function') {
      diskUsage = (diskFn as () => { total: number; used: number; free: number })();
    }
  } catch {
    // diskUsage not available in this runtime — skip gracefully
  }

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
  // Both are required for production — PG down means writes/reads fail silently
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
 * GET /health/metrics
 * Detailed system metrics in JSON format (for dashboards / Grafana)
 */
healthRouter.get('/metrics', async (req: Request, res: Response) => {
  const redis = getRedisClient();

  // Get Redis info
  let redisMetrics: {
    connected: boolean;
    used_memory: number;
    keys_count: number;
    used_memory_human?: string;
    error?: string;
    uptime_seconds?: number;
  } = { connected: false, used_memory: 0, keys_count: 0 };

  try {
    const info = await redis.info();
    // Parse Redis INFO output (key:value lines)
    const infoObj: Record<string, string> = {};
    for (const line of info.split('\r\n')) {
      if (!line || line.startsWith('#')) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        infoObj[line.slice(0, colonIdx)] = line.slice(colonIdx + 1);
      }
    }

    const usedMemoryBytes = parseInt(infoObj['used_memory'] ?? '0', 10);
    const usedMemoryHuman =
      infoObj['used_memory_human'] ?? `${(usedMemoryBytes / 1024 / 1024).toFixed(2)}M`;

    let keysCount = 0;
    try {
      const keys = await redis.keys('*');
      keysCount = Array.isArray(keys) ? keys.length : 0;
    } catch {
      keysCount = 0;
    }

    redisMetrics = {
      connected: true,
      used_memory: usedMemoryBytes,
      used_memory_human: usedMemoryHuman,
      keys_count: keysCount,
      uptime_seconds: parseInt(infoObj['uptime_in_seconds'] ?? '0', 10),
    };
  } catch (error) {
    redisMetrics = {
      connected: false,
      used_memory: 0,
      keys_count: 0,
      error: error instanceof Error ? error.message : 'Redis info failed',
    };
  }

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
