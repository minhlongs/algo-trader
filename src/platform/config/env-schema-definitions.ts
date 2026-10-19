/**
 * Environment variable schema definitions and types.
 */

import { z } from 'zod';

// ── PAPER_MODE ─────────────────────────────────────────────────────────────────

export const paperModeSchema = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

// ── Live-trading API credentials (Polymarket CLOB) ────────────────────────────

export const polymarketApiConfigSchema = z.object({
  POLYMARKET_API_KEY: z
    .string()
    .min(1, 'POLYMARKET_API_KEY must not be empty')
    .optional(),
  POLYMARKET_API_SECRET: z
    .string()
    .min(1, 'POLYMARKET_API_SECRET must not be empty')
    .optional(),
  POLYMARKET_PASSPHRASE: z
    .string()
    .min(1, 'POLYMARKET_PASSPHRASE must not be empty')
    .optional(),
  POLYMARKET_ETH_ADDRESS: z.string().min(1).optional(),

  // ── Legacy aliases (POLY_*) that will be phased out ────────────────────────
  POLY_API_KEY: z.string().optional(),
  POLY_API_SECRET: z.string().optional(),
  POLY_PASSPHRASE: z.string().optional(),
  POLY_ETH_ADDRESS: z.string().optional(),
});

// ── Live-trading guard thresholds ─────────────────────────────────────────────

export interface RiskThresholds {
  maxPositionFraction: number; // fraction of capital per position (default 0.02)
  maxDailyDrawdown: number; // fraction of capital — circuit trips above this (default 0.05)
  maxConcurrentPositions: number; // default 10
  maxConsecutiveLosses: number; // circuit breaker loss streak before halt (default 3)
}

export const riskThresholdsSchema = z
  .object({
    MAX_POSITION_FRACTION: z.coerce.number().positive().default(0.02),
    MAX_DAILY_DRAWDOWN: z.coerce.number().positive().default(0.05),
    MAX_CONCURRENT_POSITIONS: z.coerce.number().int().positive().default(10),
    MAX_CONSECUTIVE_LOSSES: z.coerce.number().int().positive().default(3),
  })
  .transform((obj) => ({
    maxPositionFraction: obj.MAX_POSITION_FRACTION,
    maxDailyDrawdown: obj.MAX_DAILY_DRAWDOWN,
    maxConcurrentPositions: obj.MAX_CONCURRENT_POSITIONS,
    maxConsecutiveLosses: obj.MAX_CONSECUTIVE_LOSSES,
  }));

// ── Security secrets (required in production) ───────────────────────────────

export const securitySecretsSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1).optional(),
  ADMIN_API_KEY: z.string().min(8, 'ADMIN_API_KEY must be at least 8 characters').optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().min(1).optional(),
  DB_PASSWORD: z.string().min(1).optional(),
});

// ── Top-level config ──────────────────────────────────────────────────────────

export interface EnvConfig {
  /** `true` (default) = paper trading, `false` = live trading on CLOB */
  paperMode: boolean;
  /** All rich live-trading env values (keys, address, capital) */
  live: {
    apiKey: string | undefined;
    apiSecret: string | undefined;
    passphrase: string | undefined;
    ethAddress: string | undefined;
  };
  /** Risk thresholds for the execution guard */
  risk: RiskThresholds;
}
