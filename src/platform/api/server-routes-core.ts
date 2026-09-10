/**
 * Core Business API Route Registrar
 */

import type { Application } from 'express';
import { tradesRouter } from './routes/trades';
import { pnlRouter } from './routes/pnl';
import { signalsRouter } from './routes/signals';
import { adminRouter } from './routes/admin';
import { revenueRouter } from './routes/revenue';
import { couponRouter } from './routes/coupon-routes';
import { blogRouter } from './routes/blog-routes';
import { blogEngagementRouter } from './routes/blog-engagement-routes';
import { newsletterRouter } from './routes/newsletter-routes';
import { analyticsRouter } from './routes/analytics-routes';
import { subscriberPnlRouter } from './routes/subscriber-pnl-routes';
import { enterpriseInquiryRouter } from './routes/enterprise-inquiry-routes';
import { personalizationRouter } from './routes/personalization-routes';
import { credentialsRouter } from './routes/credentials-routes';
import { createSignalIngestRouter } from './routes/signal-ingest-routes';
import { signalStoreD1 } from '../../signal/signal-store-d1';
import { signalSubscriptionRouter } from './routes/signal-subscription-routes';
import { signalFeedRouter } from './routes/signal-feed-api-routes';
import { leaderboardRouter } from './routes/leaderboard-routes';
import { coPilotRouter } from './routes/co-pilot-routes';
import { arbitrageRoutes } from './routes/arbitrage';
import { nowpaymentsApiRouter } from './routes/nowpayments-api-routes';
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
import { trialDripRouter } from './routes/trial-drip-routes';
import { abTestRoutes } from '../ab-testing/ab-test-routes';
import { nowpaymentsWebhookRouter } from './routes/webhooks/nowpayments-webhook';

export function registerCoreRoutes(app: Application): void {
  // Trading & market data
  app.use('/api/trades', tradesRouter);
  app.use('/api/pnl', pnlRouter);
  app.use('/api/signals', signalsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/revenue', revenueRouter);
  app.use('/api/coupons', couponRouter);
  app.use('/api/blog', blogRouter);
  app.use('/api/blog', blogEngagementRouter);
  app.use('/api/newsletter', newsletterRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/v1/subscriber', subscriberPnlRouter);
  app.use('/api/v1/enterprise', enterpriseInquiryRouter);

  // Personalization: tiered widget config, A/B variant split, event analytics
  app.use('/api/personalization', personalizationRouter);

  // Tenant credential CRUD — encrypted at rest, audited, rate-limited
  app.use('/api/v1/subscriber/credentials', credentialsRouter);

  // Signal ingest: HMAC-authenticated endpoint for Qwen M1 Max daemon
  const signalIngestRouter = createSignalIngestRouter(signalStoreD1);
  app.use('/api/v1/signals/ingest', signalIngestRouter);
  app.use('/api/v1/signals', signalSubscriptionRouter);
  app.use('/api/v1/signals', signalFeedRouter);
  app.use('/api/v1/leaderboard', leaderboardRouter);

  // Co-pilot & arbitrage
  app.use('/api/v1/co-pilot', coPilotRouter);
  app.use('/api/arbitrage', arbitrageRoutes);

  // Payments, KYC, compliance & audit
  app.use('/api/v1/nowpayments', nowpaymentsApiRouter);
  app.use('/api/kyc', kycRouter);
  app.use('/api/compliance', complianceRouter);
  app.use('/api/v1/ai-audit', aiAuditRouter);
  app.use('/api/v1/billing', internalBillingRouter);
  app.use('/api/v1/rum', rumRouter);

  // Core trading, risk, backtest, referrals & keys
  app.use('/api/v1/risk', riskRouter);
  app.use('/api/positions', positionsRouter);
  app.use('/api/backtest', backtestRouter);
  app.use('/api/v1/referral', referralRouter);
  app.use('/api/v1/api-keys', apiKeysRouter);

  // Drip campaign, A/B testing & webhooks
  app.use('/api/v1/trial-drip', trialDripRouter);
  app.use('/api/v1/ab-test', abTestRoutes);
  app.use('/api/webhooks/nowpayments', nowpaymentsWebhookRouter);
}
