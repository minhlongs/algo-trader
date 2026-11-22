/**
 * POLY-G5 Public Beta —Strict Zod Input Validation Schemas (Hard Rule H5).
 *
 * All unknown fields are rejected (`.strict()`) and caller-supplied `tenantId` or
 * `walletAddress` fields are checked and explicitly rejected if mismatched or
 * supplied as authority overrides.
 */

import { z } from 'zod';
import { APPROVED_PAPER_STRATEGIES, type ApprovedPaperStrategyId } from './poly-beta-types';

const APPROVED_STRATEGY_IDS = APPROVED_PAPER_STRATEGIES.map((s) => s.id) as [
  ApprovedPaperStrategyId,
  ...ApprovedPaperStrategyId[],
];

export const betaSignupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(160),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .max(128)
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[0-9]/, 'Password must contain a digit')
      .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
    acknowledgeSimulationAndRisk: z.literal(true),
    inviteToken: z.string().trim().min(32, 'Valid one-time invite token is required').max(128).optional(),
  })
  .strict();

export const betaLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(160),
    password: z.string().min(1).max(128),
  })
  .strict();

export const betaStrategyControlSchema = z
  .object({
    action: z.enum(['START', 'PAUSE', 'STOP', 'STEP']),
    strategyId: z.enum(APPROVED_STRATEGY_IDS).optional(),
    marketId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const betaPaperOrderSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(96)
      .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid idempotencyKey format'),
    marketId: z.string().trim().min(1).max(128),
    outcome: z.enum(['YES', 'NO']),
    side: z.enum(['BUY', 'SELL']),
    sizeShares: z.number().finite().min(5, 'Minimum order size is 5 shares').max(100),
    limitPrice: z.number().finite().min(0.01).max(0.99).optional(),
    strategyId: z.enum(APPROVED_STRATEGY_IDS).optional(),
  })
  .strict();

export const betaSettlePositionSchema = z
  .object({
    marketId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid marketId format'),
    winningOutcome: z.enum(['YES', 'NO']),
  })
  .strict();

const FORBIDDEN_CALLER_SCOPE_KEYS = [
  'tenantId',
  'tenant_id',
  'userId',
  'user_id',
  'walletAddress',
  'wallet_address',
  'privateKey',
  'seedPhrase',
  'mnemonic',
] as const;

const FORBIDDEN_URL_SECRET_KEYS = new Set(['invitetoken', 'invite_token', 'token']);

export function detectForbiddenCallerAuthorityOverride(
  url: URL,
  rawBody: unknown,
): string | null {
  for (const key of url.searchParams.keys()) {
    if (FORBIDDEN_URL_SECRET_KEYS.has(key.toLowerCase())) {
      return `Invite tokens must never be supplied in URL query parameters ("${key}")`;
    }
  }
  for (const key of FORBIDDEN_CALLER_SCOPE_KEYS) {
    if (url.searchParams.has(key)) {
      return `Caller-supplied query parameter "${key}" is forbidden`;
    }
  }
  if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
    const rec = rawBody as Record<string, unknown>;
    for (const key of FORBIDDEN_CALLER_SCOPE_KEYS) {
      if (key in rec) {
        return `Caller-supplied body field "${key}" is forbidden`;
      }
    }
  }
  return null;
}
