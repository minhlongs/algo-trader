/**
 * Marketplace Subscription Routes — Execution handlers
 *
 * Handlers for:
 *   POST /:id/execute        — trigger execution for a single subscription
 *   POST /execute-strategy   — execute strategy across all subscribers
 */
import type { Request, Response } from 'express';
import { MarketplaceExecutionBridge } from '../../marketplace/services/marketplace-execution-bridge';
import { SubscriptionService } from '../../marketplace/services/subscription.service';
import { logger } from '../../../shared/utils/logger';
import {
  getTenantId,
  getUserId,
  getQueryString,
  isAdmin,
} from './marketplace-subscription-helpers';
import { executeSchema, executeSingleSchema } from './marketplace-subscription-types';

const executionBridge = MarketplaceExecutionBridge.getInstance();
const subscriptionService = SubscriptionService.getInstance();

/**
 * POST /:id/execute — Trigger execution for a single subscription
 *
 * Validates ownership, then delegates to the execution bridge.
 * Passes marketPayload to the bridge for signal execution.
 */
export async function executeSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  const id = getQueryString(req.params.id);
  const tenantId = getTenantId(req);
  const userId = getUserId(req);

  const parsed = executeSingleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const subscription = await subscriptionService.getSubscription(id);
    if (!subscription) {
      res.status(404).json({
        error: 'Not found',
        message: `Subscription ${id} not found`,
      });
      return;
    }

    if (subscription.tenantId !== tenantId && !isAdmin(req)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot execute another tenant subscription',
      });
      return;
    }

    const result = await executionBridge.executeForSubscriber(
      id,
      parsed.data.marketPayload,
    );

    res.json({
      subscriptionId: id,
      result,
    });
  } catch (error) {
    logger.error('[Marketplace] Error executing subscription', {
      error,
      subscriptionId: id,
      tenantId,
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to execute subscription',
    });
  }
}

/**
 * POST /execute-strategy — Execute a strategy across all active subscribers
 *
 * Runs the strategy for every active subscriber of the given strategy
 * and returns per-subscriber results.
 */
export async function executeStrategyForSubscribers(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const results = await executionBridge.executeActiveForStrategy(
      parsed.data.strategyId,
      parsed.data.marketPayload,
    );

    res.json({
      strategyId: parsed.data.strategyId,
      executions: results.length,
      results,
    });
  } catch (error) {
    logger.error('[Marketplace] Error executing strategy for subscribers', {
      error,
      strategyId: parsed.data.strategyId,
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to execute strategy for subscribers',
    });
  }
}
