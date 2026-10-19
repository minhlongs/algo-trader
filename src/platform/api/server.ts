/**
 * API Server — REST + WebSocket gateway for trading operations
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import { Server } from 'http';
import { logger } from '../../shared/utils/logger';
import { RedisWSAdapter } from './ws-adapter-redis';
import { healthRouter } from './routes/health';
import { createAdminQwenRouter } from './routes/admin-qwen-routes';
import { auth } from '../auth/auth-server';
import { toNodeHandler } from 'better-auth/node';
import { EmailService } from '../notifications/email-service';
import { getMetrics } from '../middleware/prometheus-metrics';
import { errorHandler } from '../middleware/error-handler';
import { registerCoreRoutes } from './server-routes-core';
import { registerMarketplaceRoutes } from './server-routes-marketplace';
import {
  DEFAULT_CORS_ORIGINS,
  configureServerLogging,
  setupServerMiddleware,
  metricsBearerAuthGuard,
} from './server-middleware';

export {
  DEFAULT_CORS_ORIGINS,
  configureServerLogging,
  setupServerMiddleware,
  metricsBearerAuthGuard,
};

export interface ApiConfig {
  port: number;
  corsOrigin: string | string[];
}

export class ApiServer {
  private app: express.Application;
  private config: ApiConfig;
  private server?: Server;

  constructor(config?: Partial<ApiConfig>) {
    try {
      EmailService.startupCheck();
    } catch (error) {
      logger.error('[ApiServer] Email startup check failed', { error: String(error) });
      throw error;
    }

    this.app = express();
    this.config = {
      port: parseInt(process.env.API_PORT || '3000'),
      corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : DEFAULT_CORS_ORIGINS,
      ...config,
    };

    configureServerLogging();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    setupServerMiddleware(this.app, this.config.corsOrigin);
  }

  private setupRoutes(): void {
    this.app.use('/health', healthRouter);
    this.app.get('/metrics', metricsBearerAuthGuard, getMetrics);

    const authHandler = toNodeHandler(auth);
    this.app.use('/api/auth', (req, res) => {
      authHandler(req, res);
    });

    this.app.use('/api/v1/admin/qwen', createAdminQwenRouter());
    registerCoreRoutes(this.app);
    registerMarketplaceRoutes(this.app);

    this.app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    if (process.env.SENTRY_DSN) {
      Sentry.setupExpressErrorHandler(this.app);
    }

    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        logger.info(`[ApiServer] Listening on port ${this.config.port}`);
        if (process.env.REDIS_URL) {
          try {
            new RedisWSAdapter(this.server!, { path: '/ws', heartbeatIntervalMs: 30_000 });
            logger.info('[ApiServer] Redis WebSocket adapter mounted at /ws');
          } catch (err) {
            logger.error('[ApiServer] Failed to mount WS adapter', { error: String(err) });
          }
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server?.close(() => {
          logger.info('[ApiServer] Stopped');
          resolve();
        });
      });
    }
  }

  getApp(): express.Application {
    return this.app;
  }
}
