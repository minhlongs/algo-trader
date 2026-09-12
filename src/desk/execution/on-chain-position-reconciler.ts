/**
 * On-Chain Position Reconciler
 * Periodically queries Polygon CTF contract for actual token balances,
 * compares with local Redis position cache, and alerts on discrepancies.
 *
 * CTF contract: ERC1155 on Polygon (chainId 137)
 * Publishes alerts to NATS `risk.alert` topic.
 */

import { ethers } from 'ethers';
import { getRedisClient, type RedisClientType } from '../../redis';
import { getMessageBus } from '../../shared/messaging';
import { Topics } from '../../shared/messaging/topic-schema';
import { logger } from '../../shared/utils/logger';
import {
  CTF_CONTRACT_ADDRESS,
  ERC1155_ABI,
  type PositionDiscrepancy,
  type ReconciliationResult,
  type ReconcilerOptions,
} from './on-chain-position-reconciler-types';
import {
  fetchLocalPositions,
  fetchOnChainBalancesBatch,
  classifyDiscrepancySeverity,
} from './on-chain-position-reconciler-helpers';

export type {
  PositionDiscrepancy,
  ReconciliationResult,
  ReconcilerOptions,
} from './on-chain-position-reconciler-types';

export class OnChainPositionReconciler {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private redis: RedisClientType;
  private walletAddress: string;
  private loopHandle: ReturnType<typeof setInterval> | null = null;
  private readonly autoCorrect: boolean;

  constructor(options: ReconcilerOptions) {
    const rpcUrl =
      options.rpcUrl ||
      process.env.POLYGON_RPC_URL ||
      process.env.ETH_RPC_URL ||
      'https://polygon-rpc.com';

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(CTF_CONTRACT_ADDRESS, ERC1155_ABI, this.provider);
    this.redis = options.redis || getRedisClient();
    this.walletAddress = options.walletAddress;
    this.autoCorrect = options.autoCorrect ?? false;
  }

  /** Run a single reconciliation pass over all locally tracked positions */
  async reconcile(): Promise<ReconciliationResult> {
    const checkedAt = Date.now();
    const localPositions = await fetchLocalPositions(this.redis);
    const discrepancies: PositionDiscrepancy[] = [];

    if (localPositions.length === 0) {
      logger.info('[Reconciler] Pass complete — checked=0 discrepancies=0');
      return { checkedAt, positionsChecked: 0, discrepancies: [] };
    }

    const onChainBalances = await fetchOnChainBalancesBatch(
      this.contract,
      this.walletAddress,
      localPositions
    );

    for (let i = 0; i < localPositions.length; i++) {
      const pos = localPositions[i];
      const onChainBalance = onChainBalances[i];
      const difference = pos.balance - onChainBalance;

      if (difference !== 0 || onChainBalance === -1) {
        const severity = onChainBalance === -1 ? 'INFO' : classifyDiscrepancySeverity(difference);

        const discrepancy: PositionDiscrepancy = {
          marketId: pos.marketId,
          tokenId: pos.tokenId,
          localBalance: pos.balance,
          onChainBalance,
          difference,
          severity,
        };

        discrepancies.push(discrepancy);

        logger.warn(
          `[Reconciler] ${severity} — market=${pos.marketId} token=${pos.tokenId} ` +
          `local=${pos.balance} onChain=${onChainBalance} diff=${difference}`
        );

        try {
          const bus = getMessageBus();
          await bus.publish(Topics.RISK_ALERT, discrepancy, 'position-reconciler');
        } catch (err) {
          logger.error(`[Reconciler] Failed to publish alert: ${(err as Error).message}`);
        }

        if (this.autoCorrect && onChainBalance >= 0) {
          const key = `polymarket:position:${pos.marketId}:${pos.tokenId}`;
          await this.redis.set(key, onChainBalance.toString());
          logger.info(`[Reconciler] Auto-corrected ${key} → ${onChainBalance}`);
        }
      }
    }

    logger.info(
      `[Reconciler] Pass complete — checked=${localPositions.length} discrepancies=${discrepancies.length}`
    );

    return { checkedAt, positionsChecked: localPositions.length, discrepancies };
  }

  /** Start recurring reconciliation loop */
  startReconciliationLoop(intervalMs = 60_000): void {
    if (this.loopHandle) {
      logger.warn('[Reconciler] Loop already running — skipping startReconciliationLoop()');
      return;
    }

    logger.info(`[Reconciler] Starting reconciliation loop every ${intervalMs}ms`);

    this.reconcile().catch((err) =>
      logger.error(`[Reconciler] Initial pass failed: ${(err as Error).message}`)
    );

    this.loopHandle = setInterval(() => {
      this.reconcile().catch((err) =>
        logger.error(`[Reconciler] Reconciliation pass failed: ${(err as Error).message}`)
      );
    }, intervalMs);
  }

  /** Stop the reconciliation loop */
  stop(): void {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
      logger.info('[Reconciler] Reconciliation loop stopped');
    }
  }
}
