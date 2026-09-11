import { AgentQueueManager } from '../../queues/agent-queue-manager';
import { ModelTier, TIER_CONFIG } from '../../agents/agent-config';
import type { AgentInput, AgentOutputData } from './agent-dispatcher-types';

/**
 * Initialize queue managers for tiers that have a queue (Tier2 and Tier3 fallback)
 */
export function initTierQueues(redisUrl: string): Map<ModelTier, AgentQueueManager> {
  const tierQueues = new Map<ModelTier, AgentQueueManager>();
  for (const tier of [ModelTier.TIER2_SONNET, ModelTier.TIER3_OPUS]) {
    const config = TIER_CONFIG[tier];
    if (config.queueName) {
      const qm = new AgentQueueManager(
        redisUrl,
        config.queueName,
        config.maxConcurrent,
        config.rateLimit,
        tier, // pass tier for metrics labeling
      );
      tierQueues.set(tier, qm);
    }
  }
  return tierQueues;
}

export async function startWorkerQueues(
  tierQueues: Map<ModelTier, AgentQueueManager>,
  processors: Partial<Record<ModelTier, (task: AgentInput) => Promise<AgentOutputData>>>,
): Promise<void> {
  for (const [tier, processor] of Object.entries(processors) as [ModelTier, (task: AgentInput) => Promise<AgentOutputData>][]) {
    const queue = tierQueues.get(tier);
    if (queue && processor) {
      await queue.startWorker(processor);
    }
  }
}

export function collectQueueStats(tierQueues: Map<ModelTier, AgentQueueManager>): Map<ModelTier, any> {
  const stats = new Map<ModelTier, any>();
  for (const [tier, qm] of tierQueues.entries()) {
    stats.set(tier, qm.getQueueStats());
  }
  return stats;
}

export async function closeTierQueues(tierQueues: Map<ModelTier, AgentQueueManager>): Promise<void> {
  for (const qm of tierQueues.values()) {
    await qm.close();
  }
}
