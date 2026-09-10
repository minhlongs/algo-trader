/**
 * API Server — REST + WebSocket gateway for trading operations
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { Server } from 'http';
import { logger, setAggregator } from '../../shared/utils/logger';
import { LogAggregator, StdoutBackend, HttpBackend } from '../logging/log-aggregator';
import { RedisWSAdapter } from './ws-adapter-redis';
import { authMiddleware } from '../middleware/auth-middleware';
import { apiKeyLicenseMiddleware } from '../middleware/api-key-license';
import { auditMiddleware } from '../../seed/security/audit-middleware';
import { rateLimitMiddleware } from '../../forest/rate-limit/redis-rate-limiter';
import { healthRouter } from './routes/health';
import { createAdminQwenRouter } from './routes/admin-qwen-routes';
import { auth } from '../auth/auth-server';
import { toNodeHandler } from 'better-auth/node';
import { EmailService } from '../notifications/email-service';
import { metricsMiddleware, getMetrics } from '../middleware/prometheus-metrics';
import { errorHandler } from '../middleware/error-handler';
import { registerCoreRoutes } from './server-routes-core';
import { registerMarketplaceRoutes } from './server-routes-marketplace';

export interface ApiConfig {
  port: number;
  corsOrigin: string | string[];
}

const DEFAULT_CORS_ORIGINS = [
  'https://cashclaw.cc',
  'https://cashclaw-dashboard.pages.dev',
  'https://agencyos.network',
  'https://sophia.agencyos.network',
  'https://raas-landing.pages.dev',
];

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

    const logBackends = process.env.LOG_BACKEND === 'http'
      ? [new StdoutBackend(), new HttpBackend(process.env.LOG_ENDPOINT || 'http://loki:3100/loki/api/v1/push')]
      : [new StdoutBackend()];
    setAggregator(new LogAggregator({
      backends: logBackends,
      minLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    }));

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet({
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      frameguard: { action: 'deny' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'wss:', 'ws:', 'https:'],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      permittedCrossDomainPolicies: false,
    }));
    this.app.use(cors({ origin: this.config.corsOrigin }));
    this.app.use(express.json({ strict: false, limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(metricsMiddleware);
    this.app.use(authMiddleware);
    this.app.use(apiKeyLicenseMiddleware);
    this.app.use(auditMiddleware);

    const limiter = rateLimitMiddleware({ allowAnonymous: true });
    this.app.use('/api', limiter);
  }

  private setupRoutes(): void {
    this.app.use('/health', healthRouter);

    this.app.get('/metrics', (req, res, next) => {
      const metricsToken = process.env.METRICS_TOKEN;
      if (!metricsToken) return res.status(403).json({ error: 'Metrics endpoint not configured' });
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token || token !== metricsToken) return res.status(403).json({ error: 'Forbidden' });
      next();
    }, getMetrics);

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
