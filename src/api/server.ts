/**
 * API Server
 * REST + WebSocket gateway for trading operations
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { Server } from 'http';
import { logger } from '../utils/logger';

import { tradesRouter } from './routes/trades';
import { pnlRouter } from './routes/pnl';
import { signalsRouter } from './routes/signals';
import { adminRouter } from './routes/admin';
import { healthRouter } from './routes/health';
import { revenueRouter } from './routes/revenue';
import { nowpaymentsWebhookRouter } from './routes/webhooks/nowpayments-webhook';
import { couponRouter } from './routes/coupon-routes';
import { blogRouter } from './routes/blog-routes';
import { analyticsRouter } from './routes/analytics-routes';
import { personalizationRouter } from './routes/personalization-routes';
import { subscriberPnlRouter } from './routes/subscriber-pnl-routes';
import { enterpriseInquiryRouter } from './routes/enterprise-inquiry-routes';
import { createSignalIngestRouter } from './routes/signal-ingest-routes';
import { createAdminQwenRouter } from './routes/admin-qwen-routes';
import { signalStoreD1 } from '../signal/signal-store-d1';
import { auth } from '../auth/auth-server';
import { toNodeHandler } from 'better-auth/node';
import { metricsMiddleware, getMetrics } from '../middleware/prometheus-metrics';
import { errorHandler } from '../middleware/error-handler';
import { apiKeyRouter } from './routes/api-key-routes';
import { auditRouter } from './routes/audit-routes';
import { licenseRouter } from './routes/license-routes';
import { onboardingRouter } from './routes/onboarding-routes';
import { backtestRouter } from './routes/backtest';
import { RedisWSAdapter } from './ws-adapter-redis';

export interface ApiConfig {
  port: number;
  corsOrigin: string | string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

export class ApiServer {
  private app: express.Application;
  private config: ApiConfig;
  private server?: Server;
  private wsAdapter?: RedisWSAdapter;

  constructor(config?: Partial<ApiConfig>) {
    this.app = express();
    this.config = {
      port: parseInt(process.env.API_PORT || '3000'),
      corsOrigin: process.env.CORS_ORIGIN || 'https://cashclaw.cc',
      rateLimitWindowMs: 60000, // 1 minute
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      ...config,
    };

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Security — strict helmet config
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

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Prometheus metrics middleware (track all requests)
    this.app.use(metricsMiddleware);

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindowMs,
      max: this.config.rateLimitMax,
      message: { error: 'Too many requests, please try again later' },
    });
    this.app.use('/api', limiter);
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health checks (no rate limit)
    this.app.use('/health', healthRouter);
    this.app.use('/api/health', healthRouter);

    // Prometheus metrics endpoint (excluded from rate limiting, protected by Bearer token)
    this.app.get('/metrics', (req, res, next) => {
      const metricsToken = process.env.METRICS_TOKEN;
      if (!metricsToken) {
        return res.status(403).json({ error: 'Metrics endpoint not configured' });
      }
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token || token !== metricsToken) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    }, getMetrics);

    // Better Auth — handles /api/auth/* (sign-up, sign-in, session, etc.)
    const authHandler = toNodeHandler(auth);
    this.app.use('/api/auth', (req, res) => {
      authHandler(req, res);
    });

    // API routes
    this.app.use('/api/trades', tradesRouter);
    this.app.use('/api/pnl', pnlRouter);

    // Engine status and active strategies
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        uptime: process.uptime(),
        strategies: [
          { id: 'kronos', name: 'Kronos Strategy', status: 'active' }
        ],
        timestamp: Date.now()
      });
    });

    // Portfolio summary
    this.app.get('/api/portfolio', (req, res) => {
      res.json({
        equity: 10000,
        balance: 9500,
        pnl: 500,
        positions: [],
        timestamp: Date.now()
      });
    });

    this.app.use('/api/signals', signalsRouter);
    this.app.use('/api/admin', adminRouter);
    this.app.use('/api/revenue', revenueRouter);
    this.app.use('/api/coupons', couponRouter);
    this.app.use('/api/blog', blogRouter);
    this.app.use('/api/analytics', analyticsRouter);
    this.app.use('/api/personalization', personalizationRouter);
    this.app.use('/api/v1/subscriber', subscriberPnlRouter);
    this.app.use('/api/v1/enterprise', enterpriseInquiryRouter);
    this.app.use('/api/v1/keys', apiKeyRouter);
    this.app.use('/api/v1/audit', auditRouter);
    this.app.use('/api/v1/licenses', licenseRouter);
    this.app.use('/api/v1', onboardingRouter);
    this.app.use('/api/v1/backtest', backtestRouter);

    // Signal ingest: HMAC-authenticated endpoint for Qwen M1 Max daemon
    // Phase 04: stub replaced with real D1-backed SignalStoreD1
    const signalIngestRouter = createSignalIngestRouter(signalStoreD1);
    this.app.use('/api/v1/signals', signalIngestRouter);

    // Admin Qwen routes: kill switch + status (L1/L2 rollback layers)
    this.app.use('/api/v1/admin/qwen', createAdminQwenRouter());

    // Webhook routes (no rate limit — external provider callbacks)
    this.app.use('/api/webhooks/nowpayments', nowpaymentsWebhookRouter);

    // 404 handler
    this.app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Sentry error capture (must be before custom error handler)
    if (process.env.SENTRY_DSN) {
      Sentry.setupExpressErrorHandler(this.app);
    }

    // Global error handler
    this.app.use(errorHandler);
  }

  /**
   * Start server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        logger.info(`[ApiServer] Listening on port ${this.config.port}`);
        try {
          this.wsAdapter = new RedisWSAdapter(this.server!);
          logger.info('[ApiServer] RedisWSAdapter initialized');
        } catch (wsError) {
          logger.error('[ApiServer] Failed to initialize RedisWSAdapter:', wsError);
        }
        resolve();
      });
    });
  }

  /**
   * Stop server
   */
  async stop(): Promise<void> {
    if (this.wsAdapter) {
      try {
        await this.wsAdapter.shutdown();
        logger.info('[ApiServer] RedisWSAdapter shut down');
      } catch (wsError) {
        logger.error('[ApiServer] Failed to shut down RedisWSAdapter:', wsError);
      }
    }
    if (this.server) {
      return new Promise((resolve) => {
        this.server?.close(() => {
          logger.info('[ApiServer] Stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Get Express app (for testing)
   */
  getApp(): express.Application {
    return this.app;
  }
}
