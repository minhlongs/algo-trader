/**
 * API Server Middleware, Security Headers, and Logging Bootstrap Helpers
 */

import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { setAggregator } from '../../shared/utils/logger';
import { LogAggregator, StdoutBackend, HttpBackend } from '../logging/log-aggregator';
import { authMiddleware } from '../middleware/auth-middleware';
import { apiKeyLicenseMiddleware } from '../middleware/api-key-license';
import { auditMiddleware } from '../../seed/security/audit-middleware';
import { rateLimitMiddleware } from '../../forest/rate-limit/redis-rate-limiter';
import { metricsMiddleware } from '../middleware/prometheus-metrics';

export const DEFAULT_CORS_ORIGINS = [
  'https://cashclaw.cc',
  'https://cashclaw-dashboard.pages.dev',
  'https://agencyos.network',
  'https://sophia.agencyos.network',
  'https://raas-landing.pages.dev',
];

export function configureServerLogging(): void {
  const logBackends = process.env.LOG_BACKEND === 'http'
    ? [new StdoutBackend(), new HttpBackend(process.env.LOG_ENDPOINT || 'http://loki:3100/loki/api/v1/push')]
    : [new StdoutBackend()];
  setAggregator(new LogAggregator({
    backends: logBackends,
    minLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  }));
}

export function setupServerMiddleware(app: Application, corsOrigin: string | string[]): void {
  app.use(helmet({
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
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ strict: false, limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(metricsMiddleware);
  app.use(authMiddleware);
  app.use(apiKeyLicenseMiddleware);
  app.use(auditMiddleware);

  const limiter = rateLimitMiddleware({ allowAnonymous: true });
  app.use('/api', limiter);
}

export function metricsBearerAuthGuard(req: Request, res: Response, next: NextFunction): void {
  const metricsToken = process.env.METRICS_TOKEN;
  if (!metricsToken) {
    res.status(403).json({ error: 'Metrics endpoint not configured' });
    return;
  }
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== metricsToken) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
