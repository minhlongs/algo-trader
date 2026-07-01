/**
 * Marketplace Execution Bridge
 *
 * Connects marketplace subscriptions to the RaaS SubscriberExecutor.
 * When a subscription is active, market events can trigger strategy execution
 * per subscriber with their custom risk limits and allocation.
 *
 * Flow:
 * 1. activateSubscriberForExecution(subscriptionId) — marks subscription as executable
 * 2. executeForSubscriber(subscriptionId, marketPayload) — single execution
 * 3. executeActiveForStrategy(strategyId, marketPayload) — all active subscribers for a strategy
 * 4. Results sync back to subscription P&L and marketplace performance
 */

import { logger } from '../../../shared/utils/logger';
import { SubscriberExecutor } from '../../raas/subscriber-executor';
import type { SubscriberExecRequest, SubscriberExecResult } from '../../raas/subscriber-executor';
import { SubscriptionRepository, subscriptionRepository } from '../repositories/subscription-repository';
import { PerformanceRepository, performanceRepository } from '../repositories/performance-repository';
import type { IMarketplaceSubscription } from '../models/types';

export interface ExecutionBridgeResult {
  subscriptionId: string;
  subscriberId: string;
  strategyId: string;
  execResult: SubscriberExecResult;
}

export class MarketplaceExecutionBridge {
  private static instance: MarketplaceExecutionBridge;
  private executor: SubscriberExecutor;
  private subRepo: SubscriptionRepository;
  private perfRepo: PerformanceRepository;

  private constructor() {
    this.executor = new SubscriberExecutor();
    this.subRepo = subscriptionRepository;
    this.perfRepo = performanceRepository;
  }

  static getInstance(): MarketplaceExecutionBridge {
    if (!MarketplaceExecutionBridge.instance) {
      MarketplaceExecutionBridge.instance = new MarketplaceExecutionBridge();
    }
    return MarketplaceExecutionBridge.instance;
  }

  /**
   * Execute strategy for a single active marketplace subscription.
   * Uses subscription's risk limits and allocation for the execution.
   */
  async executeForSubscriber(
    subscriptionId: string,
    marketPayload: Record<string, unknown>,
  ): Promise<ExecutionBridgeResult | null> {
    const sub = await this.subRepo.findById(subscriptionId);
    if (!sub) {
      logger.warn('Subscription not found for execution', { subscriptionId });
      return null;
    }

    if (sub.status !== 'active') {
      logger.info('Subscription not active, skipping execution', {
        subscriptionId,
        status: sub.status,
      });
      return null;
    }

    // Build execution request from subscription settings
    const capitalUsdt = sub.currentInvestmentUsd > 0
      ? sub.currentInvestmentUsd / 100 // Convert cents to dollars
      : 100; // Default $100

    const req: SubscriberExecRequest = {
      subscriberId: sub.tenantId,
      strategyId: sub.strategyId,
      marketPayload,
      capitalUsdt,
    };

    const result = await this.executor.execute(req);

    // Sync execution result back to subscription
    await this.syncExecutionResult(sub, result);

    logger.info('Marketplace execution complete', {
      subscriptionId,
      subscriberId: sub.tenantId,
      strategyId: sub.strategyId,
      signal: result.signal,
      profit: result.profit,
      status: result.status,
    });

    return {
      subscriptionId: sub.id,
      subscriberId: sub.tenantId,
      strategyId: sub.strategyId,
      execResult: result,
    };
  }

  /**
   * Execute strategy for ALL active subscribers of a given strategy.
   * Called when market data arrives for a published strategy.
   */
  async executeActiveForStrategy(
    strategyId: string,
    marketPayload: Record<string, unknown>,
  ): Promise<ExecutionBridgeResult[]> {
    const activeSubs = await this.subRepo.findActiveByStrategy(strategyId);
    if (activeSubs.length === 0) {
      return [];
    }

    logger.info('Executing strategy for active subscribers', {
      strategyId,
      subscriberCount: activeSubs.length,
    });

    const results: ExecutionBridgeResult[] = [];
    for (const sub of activeSubs) {
      try {
        const result = await this.executeForSubscriber(sub.id, marketPayload);
        if (result) results.push(result);
      } catch (error) {
        logger.error('Execution failed for subscriber', {
          subscriptionId: sub.id,
          subscriberId: sub.tenantId,
          error,
        });
      }
    }

    return results;
  }

  /**
   * Sync execution result back to subscription P&L and marketplace performance.
   */
  private async syncExecutionResult(
    sub: IMarketplaceSubscription,
    result: SubscriberExecResult,
  ): Promise<void> {
    // Update subscription running P&L (profit is in dollars, convert to cents)
    const profitCents = Math.round(result.profit * 100);
    const newPnl = sub.totalPnlUsd + profitCents;
    const newInvestment = sub.currentInvestmentUsd + profitCents;

    await this.subRepo.update(sub.id, {
      totalPnlUsd: newPnl,
      currentInvestmentUsd: Math.max(0, newInvestment),
    });

    // Update marketplace performance (aggregate, no tenant breakdown)
    if (result.status === 'FILLED') {
      const isWin = result.profit > 0;
      await this.perfRepo.upsert({
        strategyId: sub.strategyId,
        date: new Date(),
        totalPnlUsd: profitCents,
        totalTrades: 1,
        winningTrades: isWin ? 1 : 0,
        losingTrades: isWin ? 0 : 1,
        avgWinUsd: isWin ? profitCents : undefined,
        avgLossUsd: isWin ? undefined : Math.abs(profitCents),
      });
    }
  }
}

export const marketplaceExecutionBridge = MarketplaceExecutionBridge.getInstance();
