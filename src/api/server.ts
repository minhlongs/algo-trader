/**
 * API Server — Express app wiring all route routers.
 *
 * Mount map:
 *   /api/v1/signals  → signalFeedRouter
 *   /api/mcp          → mcpRouter
 *   /health           → health check
 */

import express from 'express';
import { Server as HttpServer } from 'http';
import { signalFeedRouter } from './routes/signal-feed-routes';
import { mcpRouter } from './routes/mcp-routes';
import { logger } from '../shared/utils/logger';

export class ApiServer {
  private app: express.Application;
  private server: HttpServer | null = null;

  constructor() {
    this.app = express();
    this.app.use(express.json());

    this.app.use('/api/v1/signals', signalFeedRouter);
    this.app.use('/api/mcp', mcpRouter);

    // Health check
    this.app.get('/health', (_req: express.Request, res: express.Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  async start(): Promise<void> {
    const port = parseInt(process.env.API_PORT || '3000', 10);
    this.server = this.app.listen(port, () => {
      logger.info(`[Server] API listening on :${port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }
}
