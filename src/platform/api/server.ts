/** * API Server * REST + WebSocket gateway for trading operations */

import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { Server } from 'http';
import { logger, setAggregator } from '../../shared/utils/logger';
import { LogAggregator, StdoutBackend, HttpBackend } from '../logging/log-aggregator';
import { RedisWSAdapter } from './ws-adapter-redis';

// Security middleware (order matters: auth -> audit -> rate-limit)
import { authMiddleware } from '../middleware/auth-middleware';
import { apiKeyLicenseMiddleware } from '../middleware/api-key-license';
import { auditMiddleware } from '../../seed/security/audit-middleware';
import { rateLimitMiddleware } from '../../forest/rate-limit/redis-rate-limiter';

import { tradesRouter } from './routes/trades';
import { pnlRouter } from './routes/pnl';
import { signalsRouter } from './routes/signals';
import { adminRouter } from './routes/admin';
import { healthRouter } from './routes/health';
import { revenueRouter } from './routes/revenue';
import { marketplaceStrategyRouter } from './routes/marketplace-strategy-routes';
import { marketplaceSubscriptionRouter } from './routes/marketplace-subscription-routes';
import { marketplaceSubscriptionStatsRouter } from './routes/marketplace-subscription-stats-routes';
import { marketplaceSubscriptionEnhancementsRouter } from './routes/marketplace-subscription-enhancements';
import { marketplaceReviewRouter } from './routes/marketplace-review-routes';
import { marketplaceDisputeRouter } from './routes/marketplace-dispute-routes';
import { marketplaceCreatorRevenueRouter } from './routes/marketplace-creator-revenue-routes';
import { marketplaceProviderRouter } from './routes/marketplace-provider-routes';
import { marketplaceListingBadgeRouter, marketplaceBadgeDefinitionRouter } from './routes/marketplace-badge-routes';
import { nowpaymentsApiRouter } from './routes/nowpayments-api-routes';
import { nowpaymentsWebhookRouter } from './routes/webhooks/nowpayments-webhook';
import { trialDripRouter } from './routes/trial-drip-routes';
import { couponRouter } from './routes/coupon-routes';
import { blogRouter } from './routes/blog-routes';
import { blogEngagementRouter } from './routes/blog-engagement-routes';
import { newsletterRouter } from './routes/newsletter-routes';
import { analyticsRouter } from './routes/analytics-routes';
import { subscriberPnlRouter } from './routes/subscriber-pnl-routes';
import { credentialsRouter } from './routes/credentials-routes';
import { personalizationRouter } from './routes/personalization-routes';
import { enterpriseInquiryRouter } from './routes/enterprise-inquiry-routes';
import { createSignalIngestRouter } from './routes/signal-ingest-routes';
import { createAdminQwenRouter } from './routes/admin-qwen-routes';
import { signalSubscriptionRouter } from './routes/signal-subscription-routes';
import { signalFeedRouter } from './routes/signal-feed-api-routes';
import { leaderboardRouter } from './routes/leaderboard-routes';
import { coPilotRouter } from './routes/co-pilot-routes';
import { arbitrageRoutes } from './routes/arbitrage';
import { kycRouter } from './routes/kyc-routes';
import { complianceRouter } from './routes/compliance-routes';
import aiAuditRouter from './routes/ai-audit-routes';
import { internalBillingRouter } from './routes/internal-billing-routes';
import { rumRouter } from './routes/rum-ingest-routes';
import { riskRouter } from './routes/risk-routes';
import { positionsRouter } from './routes/positions';
import { backtestRouter } from './routes/backtest';
import { referralRouter } from './routes/referral-routes';
import { apiKeysRouter } from './routes/api-keys';
import { abTestRoutes } from '../ab-testing/ab-test-routes';
import { signalStoreD1 } from '../../signal/signal-store-d1';
import { auth } from '../auth/auth-server';
import { toNodeHandler } from 'better-auth/node';
import { EmailService } from '../notifications/email-service';
import { metricsMiddleware, getMetrics } from '../middleware/prometheus-metrics';
import { errorHandler } from '../middleware/error-handler';

// Admin marketplace routes
import { adminMarketplaceRouter } from './routes/admin-marketplace-routes';
import { registerMarketplaceDisputeRoutes } from './routes/admin-marketplace-dispute-routes';
import { registerMarketplaceRevenueRoutes } from './routes/admin-marketplace-revenue-routes';
import { registerMarketplaceVettingRoutes } from './routes/admin-marketplace-strategy-vetting-routes';

// Admin DNA routes
import { createAdminDnaRouter } from './routes/admin-dna-routes';
import { adminDnaRouter } from './routes/admin-dna';

// Marketplace routes
import { marketplaceStrategyInsightsRouter } from './routes/marketplace-strategy-insights-routes';
import { marketplaceStrategyListingsRouter } from './routes/marketplace-strategy-listings-routes';
import { marketplaceStrategyManagementRouter } from './routes/marketplace-strategy-management-routes';
import { communityStrategyRouter } from './routes/community-strategy-routes';
import { subscriptionAnalyticsRouter } from './routes/subscription-analytics-routes';

export interface ApiConfig {
  port: number;
  corsOrigin: string | string[];
}

export class ApiServer {
  private app: express.Application;
  private config: ApiConfig;
  private server?: Server;

  constructor(config?: Partial<ApiConfig>) {
    // Fail loudly in production if email provider is not configured.
    // Fire-and-forget so a missing key never blocks server boot.
    try {
      EmailService.startupCheck();
    } catch (error) {
      logger.error('[ApiServer] Email startup check failed', { error: String(error) });
      throw error;
    }

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
      ...config,
    };

    // Wire centralized logging aggregator
    const logBackends = process.env.LOG_BACKEND === 'http'
      ? [new StdoutBackend(), new HttpBackend(process.env.LOG_ENDPOINT || 'http://loki:3100/loki/api/v1/push')]
      : [new StdoutBackend()];
    const aggregator = new LogAggregator({
      backends: logBackends,
      minLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    });
    setAggregator(aggregator);

    this.setupMiddleware();
    this.setupRoutes();
  }

  /** * Setup middleware */
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
      }),
    );
    this.app.use(cors({ origin: this.config.corsOrigin }));

    // Body parsing
    this.app.use(express.json({ strict: false, limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Prometheus metrics middleware (track all requests)
    this.app.use(metricsMiddleware);

    // Global identity resolution — attaches req.claims + req.user from Bearer JWT.
    // Mounted BEFORE audit + rate-limit so they see real tier/tenant context.
    this.app.use(authMiddleware);

    // Bridge x-api-key header → req.license for tier-gated endpoints
    this.app.use(apiKeyLicenseMiddleware);

    // Audit logging middleware (fire-and-forget, captures all responses)
    this.app.use(auditMiddleware);

    // Rate limiting (Redis-backed, tier-aware) — scoped to /api subtree
    // so /health and /metrics bypass throttling.
    const limiter = rateLimitMiddleware({ allowAnonymous: true });
    this.app.use('/api', limiter);
  }

  /** * Setup routes */
  private setupRoutes(): void {
    // Health checks (no rate limit)
    this.app.use('/health', healthRouter);

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
    this.app.use('/api/coupons', couponRouter);
    this.app.use('/api/blog', blogRouter);
    this.app.use('/api/blog', blogEngagementRouter);
    this.app.use('/api/newsletter', newsletterRouter);
    this.app.use('/api/analytics', analyticsRouter);
    this.app.use('/api/v1/subscriber', subscriberPnlRouter);
    this.app.use('/api/v1/enterprise', enterpriseInquiryRouter);

    // Personalization: tiered widget config, A/B variant split, event analytics
    this.app.use('/api/personalization', personalizationRouter);

    // Tenant credential CRUD — encrypted at rest, audited, rate-limited
    this.app.use('/api/v1/subscriber/credentials', credentialsRouter);

    // Signal ingest: HMAC-authenticated endpoint for Qwen M1 Max daemon
    // Phase 04: stub replaced with real D1-backed SignalStoreD1
    const signalIngestRouter = createSignalIngestRouter(signalStoreD1);
    this.app.use('/api/v1/signals/ingest', signalIngestRouter);
    this.app.use('/api/v1/signals', signalSubscriptionRouter);
    this.app.use('/api/v1/signals', signalFeedRouter);
    this.app.use('/api/v1/leaderboard', leaderboardRouter);

    // Co-pilot routes: AI trading assistant (PRO+ tier gated, rate limited)
    this.app.use('/api/v1/co-pilot', coPilotRouter);

    // Arbitrage engine routes (execution, metrics, status)
    this.app.use('/api/arbitrage', arbitrageRoutes);

    // Admin Qwen routes: kill switch + status (L1/L2 rollback layers)
    this.app.use('/api/v1/admin/qwen', createAdminQwenRouter());

    // Admin marketplace routes
    this.app.use('/api/v1/admin/marketplace', adminMarketplaceRouter);
    const adminDisputeRouter = Router();
    registerMarketplaceDisputeRoutes(adminDisputeRouter);
    this.app.use('/api/v1/admin/marketplace/disputes', adminDisputeRouter);
    const adminRevenueRouter = Router();
    registerMarketplaceRevenueRoutes(adminRevenueRouter);
    this.app.use('/api/v1/admin/marketplace/revenue', adminRevenueRouter);
    const adminVettingRouter = Router();
    registerMarketplaceVettingRoutes(adminVettingRouter);
    this.app.use('/api/v1/admin/marketplace/vetting', adminVettingRouter);

    // Admin DNA routes
    this.app.use('/api/v1/admin/dna', createAdminDnaRouter());
    this.app.use('/api/v1/admin/dna-legacy', adminDnaRouter);

    // Marketplace routes
    this.app.use('/api/v1/marketplace/insights', marketplaceStrategyInsightsRouter);
    this.app.use('/api/v1/marketplace/listings', marketplaceStrategyListingsRouter);
    this.app.use('/api/v1/marketplace/management', marketplaceStrategyManagementRouter);
    this.app.use('/api/v1/marketplace/community', communityStrategyRouter);

    // Subscription analytics routes
    this.app.use('/api/v1/subscriptions/analytics', subscriptionAnalyticsRouter);

    // NOWPayments API routes (invoice creation, checkout redirect)
    this.app.use('/api/v1/nowpayments', nowpaymentsApiRouter);

    // KYC verification routes (BYOK Persona, tier-gated)
    this.app.use('/api/kyc', kycRouter);

    // Compliance routes (AML/KYC regulatory validation)
    this.app.use('/api/compliance', complianceRouter);

    // AI audit routes (decision tracking, model confidence logging)
    this.app.use('/api/v1/ai-audit', aiAuditRouter);

    // Internal billing routes (operator-only, shared secret auth)
    this.app.use('/api/v1/billing', internalBillingRouter);

    // RUM (Real User Monitoring) ingestion routes
    this.app.use('/api/v1/rum', rumRouter);

    // Core trading routes
    this.app.use('/api/v1/risk', riskRouter);
    this.app.use('/api/positions', positionsRouter);
    this.app.use('/api/backtest', backtestRouter);
    this.app.use('/api/v1/referral', referralRouter);
    this.app.use('/api/v1/api-keys', apiKeysRouter);

    // Trial drip campaign routes
    this.app.use('/api/v1/trial-drip', trialDripRouter);

    // A/B testing routes (experiment management, outcome tracking)
    this.app.use('/api/v1/ab-test', abTestRoutes);

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

  /** * Start server */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        logger.info(`[ApiServer] Listening on port ${this.config.port}`);

        // Mount Redis WebSocket adapter for real-time streaming
        if (process.env.REDIS_URL) {
          try {
            new RedisWSAdapter(this.server!, {
              path: '/ws',
              heartbeatIntervalMs: 30_000,
            });
            logger.info('[ApiServer] Redis WebSocket adapter mounted at /ws');
          } catch (err) {
            logger.error('[ApiServer] Failed to mount WS adapter', { error: String(err) });
          }
        }

        resolve();
      });
    });
  }

  /** * Stop server */
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

  /** * Get Express app (for testing) */
  getApp(): express.Application {
    return this.app;
  }
}
