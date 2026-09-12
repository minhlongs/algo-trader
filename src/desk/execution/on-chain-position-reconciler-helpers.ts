/**
 * On-Chain Position Reconciler Helpers — scanning, RPC batch queries, severity
 */

import type { ethers } from 'ethers';
import type { RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import {
  type LocalTrackedPosition,
  CRITICAL_THRESHOLD_UNITS,
} from './on-chain-position-reconciler-types';

/** Read tracked polymarket positions from Redis */
export async function fetchLocalPositions(
  redis: RedisClientType
): Promise<LocalTrackedPosition[]> {
  const allKeys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor, 'MATCH', 'polymarket:position:*', 'COUNT', '100'
    );
    cursor = nextCursor;
    allKeys.push(...keys);
  } while (cursor !== '0');

  if (allKeys.length === 0) return [];

  const values = await redis.mget(allKeys);
  const positions: LocalTrackedPosition[] = [];

  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i];
    const raw = values[i];
    const parts = key.split(':');
    if (parts.length < 4) continue;
    const marketId = parts[2];
    const tokenId = parts[3];
    const balance = raw ? parseFloat(raw) : 0;
    positions.push({ marketId, tokenId, balance });
  }

  return positions;
}

/** Query on-chain ERC1155 single balance */
export async function fetchOnChainBalanceSingle(
  contract: ethers.Contract,
  walletAddress: string,
  tokenId: string
): Promise<number> {
  try {
    const raw: bigint = await contract.balanceOf(walletAddress, BigInt(tokenId));
    return Number(raw);
  } catch (err) {
    logger.warn(`[Reconciler] balanceOf failed for tokenId ${tokenId}: ${(err as Error).message}`);
    return -1;
  }
}

/** Severity: CRITICAL if |diff| >= $5, WARNING if any diff, INFO otherwise */
export function classifyDiscrepancySeverity(difference: number): 'INFO' | 'WARNING' | 'CRITICAL' {
  const absDiff = Math.abs(difference);
  if (absDiff >= CRITICAL_THRESHOLD_UNITS) return 'CRITICAL';
  if (absDiff > 0) return 'WARNING';
  return 'INFO';
}

/** Query on-chain ERC1155 batch balance with chunking and individual fallback */
export async function fetchOnChainBalancesBatch(
  contract: ethers.Contract,
  walletAddress: string,
  positions: LocalTrackedPosition[]
): Promise<number[]> {
  const CHUNK_SIZE = 100;
  const rawBalances: bigint[] = [];

  try {
    for (let i = 0; i < positions.length; i += CHUNK_SIZE) {
      const chunk = positions.slice(i, i + CHUNK_SIZE);
      const tokenIds = chunk.map((pos) => BigInt(pos.tokenId));
      const accounts = Array(chunk.length).fill(walletAddress);
      const chunkBalances: bigint[] = await contract.balanceOfBatch(accounts, tokenIds);
      rawBalances.push(...chunkBalances);
    }
    return rawBalances.map((b) => Number(b));
  } catch (err) {
    logger.error(`[Reconciler] balanceOfBatch failed: ${(err as Error).message}. Falling back to individual queries.`);
    const fallbackBalances: number[] = [];
    for (const pos of positions) {
      const bal = await fetchOnChainBalanceSingle(contract, walletAddress, pos.tokenId);
      fallbackBalances.push(bal);
    }
    return fallbackBalances;
  }
}
