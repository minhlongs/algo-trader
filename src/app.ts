/**
 * Application Bootstrap
 * Starts the API server and handles graceful shutdown.
 * All routes (trades, pnl, signals, admin, webhooks, coupons) are registered in ApiServer.
 */

import 'dotenv/config';
import { ApiServer } from './api/server';
import { logger } from './shared/utils/logger';
import { getLatencyMonitor } from './regions/latency-monitor';

import { runMigrations } from './db/migration-runner';
import { startAugmentedSignalPipeline } from './desk/wiring/augmented-signal-pipeline';
import { thresholdAlerts } from './platform/middleware/threshold-alerts';

let server: ApiServer | null = null;
let augmentedPipelineStop: (() => Promise<void>) | null = null;

export async function startApp(): Promise<void> {
  // Run DB migrations on startup
  await runMigrations().catch((err) => {
    logger.warn('[App] Migration runner skipped or failed:', { err });
  });

  server = new ApiServer();
  await server.start();

  // Start multi-region latency monitoring (Phase 5)
  if (process.env.ENABLE_LATENCY_MONITORING !== 'false') {
    getLatencyMonitor().start();
    logger.info('[App] Latency monitor started');
  }

  // Phase 08: Wire augmented-signal-pipeline (AI validation gate for strategy signals)
  // DeepSeek gating; false → bypass for backtesting or when NATS is absent.
  const aiEnabled = (process.env.AI_VALIDATION_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (aiEnabled) {
    augmentedPipelineStop = await startAugmentedSignalPipeline();
    logger.info('[App] Augmented signal pipeline started (AI validation enabled)');
  } else {
    logger.warn('[App] AI validation disabled (AI_VALIDATION_ENABLED=false)');
  }

  // Start threshold alerts + Telegram bot (requires TELEGRAM_BOT_TOKEN env)
  thresholdAlerts.initialize();
  logger.info('[App] Threshold alerts + Telegram bot initialized');

  const port = process.env.API_PORT || '3000';
  const env = process.env.NODE_ENV || 'development';
  logger.info(`[App] AlgoTrade API running — port=${port} env=${env}`);
}

export async function stopApp(): Promise<void> {
 if (augmentedPipelineStop) {
   await augmentedPipelineStop().catch((err) => logger.warn('[App] Pipeline shutdown failed', { err }));
 }
 if (server) {
   await server.stop();
   server = null;
   logger.info('[App] Shutdown complete');
 }
}

// Graceful shutdown handlers
function handleShutdown(signal: string): void {
  logger.info(`[App] Received ${signal}, shutting down gracefully...`);
  stopApp()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('[App] Error during shutdown', err);
      process.exit(1);
    });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Entry point — only run when executed directly (not imported by tests)
if (require.main === module) {
  startApp().catch((err) => {
    logger.error('[App] Failed to start', err);
    process.exit(1);
  });
}
