import { calculateRevenueMetrics } from '@platform/billing/revenue-analytics';
import type { License } from '@shared/types/license';
import type { Subscription } from '@platform/billing/subscription-service';
import { logger } from '@shared/utils/logger';

export class ContentAgent {
  onStrategyPublished(strategyId: string): void {
    logger.info('[ContentAgent] Strategy published', { strategyId });
  }

  onWeeklyReport(licenses: License[], subscriptions: Subscription[]): void {
    const metrics = calculateRevenueMetrics(licenses, subscriptions);
    logger.info('[ContentAgent] Weekly report generated', { metrics });
  }
}
