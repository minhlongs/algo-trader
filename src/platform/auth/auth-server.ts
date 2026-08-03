/**
 * Better Auth Server Instance
 * PostgreSQL-backed auth with email/password + session management.
 * Mounted on Express API server at /api/auth/*.
 *
 * Features:
 * - Email/password authentication
 * - Auto sign-in after registration
 * - Secure session management (cookie-based)
 * - Rate limiting built-in
 */

import { betterAuth } from 'better-auth';
import pg from 'pg';
import { logger } from '../utils/logger';
import { TrialDripService } from '../billing/trial-drip-service';

const { Pool } = pg;

const isProd = process.env.NODE_ENV === 'production';

const authSecret = process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET;
if (!authSecret) {
  if (isProd) {
    throw new Error('[BetterAuth] FATAL: BETTER_AUTH_SECRET or JWT_SECRET must be set in production');
  }
  logger.warn('[BetterAuth] No BETTER_AUTH_SECRET or JWT_SECRET set — using insecure dev fallback');
}

const dbPassword = process.env.DB_PASSWORD;
if (isProd && dbPassword === undefined) {
  throw new Error('[BetterAuth] FATAL: DB_PASSWORD must be set in production');
  }

/** Create and export the Better Auth instance */
export const auth = betterAuth({
  database: new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'algo_trader',
    user: process.env.DB_USER || 'postgres',
    password: dbPassword || '',
    max: 5,
  }),
  secret: authSecret || 'dev-only-insecure-secret-change-me',
  baseURL: process.env.BETTER_AUTH_URL || process.env.API_BASE_URL || 'http://localhost:3000',
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh every 24h
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min cookie cache
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Fire-and-forget: register new signups in trial-drip campaign.
          // Errors are caught + logged so a drip failure never breaks signup.
          try {
            const trialDripService = TrialDripService.getInstance();
            const email = user.email ?? '';
            const tier: string = 'FREE';
            const tenantId = user.id;
            const trialDays = 7;
            if (email && tenantId) {
              trialDripService.subscribe(email, tenantId, tier, trialDays);
              logger.info('[BetterAuth][afterSignup] Trial drip registered', {
                email,
                tenantId,
                tier,
              });
            }
          } catch (error) {
            logger.error(
              '[BetterAuth][afterSignup] Trial drip registration failed',
              {
                error: String(error),
                userId: user.id,
              },
            );
          }
        },
      },
    },
  },
  trustedOrigins: [
    'https://cashclaw.cc',
    'https://algo-trader.pages.dev',
    'https://cashclaw-dashboard.pages.dev',
    'http://localhost:3001',
    'http://localhost:5173',
  ],
  logger: {
    disabled: false,
    level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
  },
});

logger.info('[BetterAuth] Auth instance created');
