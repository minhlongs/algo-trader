/**
 * Environment variable schemas and validation for algo-trader.
 *
 * Centralizes all env-var parsing so callers never read `process.env` directly.
 * Call `validate()` at startup; use the typed config objects everywhere else.
 */

import { z } from 'zod';

// ── PAPER_MODE ─────────────────────────────────────────────────────────────────

const paperModeSchema = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

// ── Live-trading API credentials (Polymarket CLOB) ────────────────────────────

const polymarketApiConfigSchema = z.object({
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

const riskThresholdsSchema = z
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

const securitySecretsSchema = z.object({
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


// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolve a credential env-var, checking both new (POLYMARKET_*) and legacy (POLY_*) names.
 * Returns undefined when neither is set; throws on explicit empty string.
 */
function resolveCredential(
  newName: string,
  legacyName: string,
): string | undefined {
  const newVal = process.env[newName];
  if (newVal !== undefined) return newVal;
  const legacyVal = process.env[legacyName];
  if (legacyVal !== undefined) return legacyVal;
  // Neither set → undefined (validator decides if required)
  return undefined;
}

/**
 * Parse and validate all trading-relevant env vars.
 * Call once at process startup; reuse the returned config.
 */
export function validateEnv(): EnvConfig {
  const paperMode = paperModeSchema.parse(
    process.env['PAPER_MODE'] ?? 'true',
  );

  const polymarketRaw = polymarketApiConfigSchema.parse({});

  const riskThresholds = riskThresholdsSchema.parse({});

  // Validate security secrets (warn in dev, require in production)
  const secrets = securitySecretsSchema.parse({});
  const isProd = process.env['NODE_ENV'] === 'production';
  if (isProd) {
    const missingSecrets: string[] = [];
    if (!secrets.BETTER_AUTH_SECRET && !secrets.JWT_SECRET) missingSecrets.push('BETTER_AUTH_SECRET or JWT_SECRET');
    if (!secrets.ADMIN_API_KEY) missingSecrets.push('ADMIN_API_KEY');
    if (!secrets.DB_PASSWORD) missingSecrets.push('DB_PASSWORD');
    if (missingSecrets.length > 0) {
      throw new Error(
        `Production requires security secrets:\n  ${missingSecrets.join('\n  ')}\n` +
        `Set them in .env or run with NODE_ENV=development for local dev.`
      );
    }
  } else {
    const present = Object.entries(secrets).filter(([, v]) => v != null).map(([k]) => k);
    if (present.length > 0) {
      // eslint-disable-next-line no-console
      console.info(`[EnvSchema] Security secrets loaded: ${present.join(', ')}`);
    }
  }

  return {
    paperMode,
    live: {
      apiKey:
        polymarketRaw.POLYMARKET_API_KEY ?? polymarketRaw.POLY_API_KEY,
      apiSecret:
        polymarketRaw.POLYMARKET_API_SECRET ?? polymarketRaw.POLY_API_SECRET,
      passphrase:
        polymarketRaw.POLYMARKET_PASSPHRASE ??
        polymarketRaw.POLY_PASSPHRASE,
      ethAddress:
        polymarketRaw.POLYMARKET_ETH_ADDRESS ??
        polymarketRaw.POLY_ETH_ADDRESS,
    },
    risk: riskThresholds,
  };
}

/**
 * Check whether live trading mode is viable. Throws if in LIVE mode but any
 * required credential is missing.
 */
export function assertLiveCredentials(paperMode: boolean): void {
  if (paperMode) return; // nothing to check in paper mode

  const apiKey =
    process.env['POLYMARKET_API_KEY'] ?? process.env['POLY_API_KEY'];
  const apiSecret =
    process.env['POLYMARKET_API_SECRET'] ?? process.env['POLY_API_SECRET'];
  const passphrase =
    process.env['POLYMARKET_PASSPHRASE'] ?? process.env['POLY_PASSPHRASE'];

  const missing: string[] = [];
  if (!apiKey) missing.push('POLYMARKET_API_KEY (or legacy POLY_API_KEY)');
  if (!apiSecret)
    missing.push('POLYMARKET_API_SECRET (or legacy POLY_API_SECRET)');
  if (!passphrase)
    missing.push('POLYMARKET_PASSPHRASE (or legacy POLY_PASSPHRASE)');

  if (missing.length > 0) {
    throw new Error(
      `LIVE trading requires all Polymarket credentials.\n` +
        `Missing:\n  ${missing.join('\n  ')}\n` +
        `Set them in .env or run with PAPER_MODE=true for paper trading.`,
    );
  }
}

/**
 * Convenience — get PAPER_MODE as boolean, defaulting to true.
 * Thin wrapper over the schema so callers don't need to import the full module.
 */
export function getPaperMode(): boolean {
  return paperModeSchema.parse(process.env['PAPER_MODE'] ?? 'true');
}
