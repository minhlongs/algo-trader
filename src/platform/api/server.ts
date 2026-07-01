/**
 * API Server
 * REST + WebSocket gateway for trading operations
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { distributedRateLimiter } from '../middleware/distributed-rate-limiter';
import * as Sentry from '@sentry/node';
import { Server } from 'http';
import { logger } from '../../shared/utils/logger';

import { tradesRouter } from './routes/trades';
import { pnlRouter } from './routes/pnl';
import { signalsRouter } from './routes/signals';
import { adminRouter } from './routes/admin';
import { healthRouter } from './routes/health';
import { revenueRouter } from './routes/revenue';
import { marketplaceStrategyRouter } from './routes/marketplace-strategy-routes';
import { marketplaceSubscriptionRouter } from './routes/marketplace-subscription-routes';
import { marketplaceReviewRouter } from './routes/marketplace-review-routes';
import { marketplaceDisputeRouter } from './routes/marketplace-dispute-routes';
import { marketplaceCreatorRevenueRouter } from './routes/marketplace-creator-revenue-routes';
import { adminMarketplaceRouter } from './routes/admin-marketplace-routes';
import { nowpaymentsWebhookRouter } from './routes/webhooks/nowpayments-webhook';
import { couponRouter } from './routes/coupon-routes';
import { blogRouter } from './routes/blog-routes';
import { analyticsRouter } from './routes/analytics-routes';
import { subscriberPnlRouter } from './routes/subscriber-pnl-routes';
import { enterpriseInquiryRouter } from './routes/enterprise-inquiry-routes';
import { createSignalIngestRouter } from './routes/signal-ingest-routes';
import { createAdminQwenRouter } from './routes/admin-qwen-routes';
import { auth } from '../auth/auth-server';
import { toNodeHandler } from 'better-auth/node';
import { metricsMiddleware, getMetrics } from '../middleware/prometheus-metrics';
import { errorHandler } from '../middleware/error-handler';

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

  constructor(config?: Partial<ApiConfig>) {
    this.app = express();
    this.config = {
      port: parseInt(process.env.API_PORT || '3000'),
      corsOrigin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',')
        : [
            'https://cashclaw.cc',
            'https://cashclaw-dashboard.pages.dev',
            'https://agencyos.network',
            'https://sophia.agencyos.network',
            'https://raas-landing.pages.dev',
          ],
      rateLimitWindowMs: 60000, // 1 minute
      rateLimitMax: 100, // 100 requests per minute
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

 // Rate limiting — distributed tier-aware limiter (Redis-backed)
  // Rate limiting — express-rate-limit + distributed tier-aware limiter (Redis-backed)
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindowMs,
      max: this.config.rateLimitMax,
      message: { error: 'Too many requests, please try again later' },
    standardHeaders: false,
    legacyHeaders: false,
  skip: () => true, // distributedRateLimiter handles actual rate limiting
    });
    this.app.use('/api', limiter);
    this.app.use('/api', distributedRateLimiter);
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
    this.app.use('/api/signals', signalsRouter);
    this.app.use('/api/admin', adminRouter);
    this.app.use('/api/revenue', revenueRouter);

// Marketplace routes
this.app.use('/api/v1/marketplace/strategies', marketplaceStrategyRouter);
this.app.use('/api/v1/marketplace/subscriptions', marketplaceSubscriptionRouter);
this.app.use('/api/v1/marketplace/reviews', marketplaceReviewRouter);
this.app.use('/api/v1/marketplace/disputes', marketplaceDisputeRouter);
this.app.use('/api/v1/marketplace/revenue', marketplaceCreatorRevenueRouter);

// Admin marketplace routes
this.app.use('/api/admin/marketplace', adminMarketplaceRouter);
    this.app.use('/api/coupons', couponRouter);
    this.app.use('/api/blog', blogRouter);
    this.app.use('/api/analytics', analyticsRouter);
    this.app.use('/api/v1/subscriber', subscriberPnlRouter);
    this.app.use('/api/v1/enterprise', enterpriseInquiryRouter);

    // Signal ingest: HMAC-authenticated endpoint for Qwen M1 Max daemon (Phase 03)
    // Store stub — Phase 04 wires real D1/SQLite persistence
    const signalIngestRouter = createSignalIngestRouter({
      saveSignal: async (signal) => { logger.debug('[SignalStore] saveSignal stub', { id: signal.id }); },
      getSubscriptions: async () => [],
    });
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
        resolve();
      });
    });
  }

  /**
   * Stop server
   */
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

  /**
   * Get Express app (for testing)
   */
  getApp(): express.Application {
    return this.app;
  }
}
