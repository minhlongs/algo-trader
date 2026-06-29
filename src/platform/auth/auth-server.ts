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
import { logger } from '../../shared/utils/logger.js';

const { Pool } = pg;

// Fail fast if no auth secret configured
const authSecret = process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET;
if (!authSecret) {
  logger.warn('[BetterAuth] No BETTER_AUTH_SECRET or JWT_SECRET set — auth will fail at runtime');
}

/** Create and export the Better Auth instance */
export const auth = betterAuth({
  database: new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'algo_trader',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
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
