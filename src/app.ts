/**
 * Application Bootstrap
 * Starts the API server and handles graceful shutdown.
 * All routes (trades, pnl, signals, admin, webhooks, coupons) are registered in ApiServer.
 */

import 'dotenv/config';
import { ApiServer } from './platform/api/server';
import { logger } from './shared/utils/logger';

let server: ApiServer | null = null;
let augmentedPipelineStop: (() => Promise<void>) | null = null;

export async function startApp(): Promise<void> {
  // Start the API surface first, then hydrate non-critical subsystems lazily.
  // This keeps the critical request path fast during cold start.
  server = new ApiServer();
  await server.start();

  // Defer heavy subsystems so they don’t block first-response readiness.
  await Promise.allSettled([
    (async () => {
      const { runMigrations } = await import('./db/migration-runner');
      await runMigrations().catch((err) => {
        logger.warn('[App] Migration runner skipped or failed:', { err });
      });
    })(),
    (async () => {
      if (process.env.ENABLE_LATENCY_MONITORING !== 'false') {
        const { getLatencyMonitor } = await import('./regions/latency-monitor');
        getLatencyMonitor().start();
        logger.info('[App] Latency monitor started');
      }
    })(),
    (async () => {
      const aiEnabled = (process.env.AI_VALIDATION_ENABLED ?? 'true').toLowerCase() !== 'false';
      if (aiEnabled) {
        const { startAugmentedSignalPipeline } = await import('./desk/wiring/augmented-signal-pipeline');
        augmentedPipelineStop = await startAugmentedSignalPipeline();
        logger.info('[App] Augmented signal pipeline started (AI validation enabled)');
      } else {
        logger.warn('[App] AI validation disabled (AI_VALIDATION_ENABLED=false)');
      }
    })(),
    (async () => {
      const { thresholdAlerts } = await import('./platform/middleware/threshold-alerts');
      thresholdAlerts.initialize();
      logger.info('[App] Threshold alerts + Telegram bot initialized');
    })(),
    (async () => {
      if (process.env.ALPHAEAR_SIDECAR_URL) {
        const { startSidecarMonitor } = await import('./desk/intelligence/kronos-sidecar-monitor');
        startSidecarMonitor();
        logger.info('[App] Kronos sidecar monitor started');
      } else {
        logger.debug('[App] ALPHAEAR_SIDECAR_URL not set — Kronos monitor skipped');
      }
    })(),
  ]);

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
