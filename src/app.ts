/**
 * Application Bootstrap
 * Starts the API server and handles graceful shutdown.
 * All routes (trades, pnl, signals, admin, webhooks, coupons) are registered in ApiServer.
 */

import 'dotenv/config';
import { ApiServer } from './platform/api/server';
import { logger } from './shared/utils/logger';

let server: ApiServer | null = null;

export async function startApp(): Promise<void> {
  server = new ApiServer();
  await server.start();

  const port = process.env.API_PORT || '3000';
  const env = process.env.NODE_ENV || 'development';
  logger.info(`[App] AlgoTrade API running — port=${port} env=${env}`);
}

export async function stopApp(): Promise<void> {
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
