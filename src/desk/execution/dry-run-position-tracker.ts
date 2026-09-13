/**
 * Dry-Run Position Tracker
 *
 * Types, position management, and Redis persistence helpers for dry-run execution.
 * Pure functions with Redis dependency injected. Used by DryRunExecutor.
 *
 * Week 3-4: Risk Management - Simulated order tracking
 */

import { type RedisClientType } from '../../redis';
import {
  DRY_RUN_KEYS,
  PaperPosition,
  PaperTrade,
  PaperAccount,
} from './dry-run-position-types';

export * from './dry-run-position-types';
export * from './dry-run-position-math';
export * from './dry-run-position-pnl';

// ─── Redis Persistence Helpers ────────────────────────────────────────────────

export async function saveAccountToRedis(
  redis: RedisClientType,
  account: PaperAccount,
): Promise<void> {
  await redis.set(DRY_RUN_KEYS.ACCOUNT, JSON.stringify(account));
}

export async function saveTradeToRedis(
  redis: RedisClientType,
  trade: PaperTrade,
): Promise<void> {
  await redis.lpush(DRY_RUN_KEYS.TRADES, JSON.stringify(trade));
  await redis.ltrim(DRY_RUN_KEYS.TRADES, 0, 999);
}

export async function savePositionsToRedis(
  redis: RedisClientType,
  positions: PaperPosition[],
): Promise<void> {
  await redis.set(DRY_RUN_KEYS.POSITIONS, JSON.stringify(positions));
}

export async function loadPositionsFromRedis(
  redis: RedisClientType,
): Promise<PaperPosition[]> {
  const data = await redis.get(DRY_RUN_KEYS.POSITIONS);
  if (!data) return [];
  return JSON.parse(data) as PaperPosition[];
}

export async function loadAccountFromRedis(
  redis: RedisClientType,
): Promise<PaperAccount | null> {
  const data = await redis.get(DRY_RUN_KEYS.ACCOUNT);
  if (!data) return null;
  return JSON.parse(data) as PaperAccount;
}
