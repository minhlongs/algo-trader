/**
 * Agent Coordinator Dispatch & Queue Inspection Helpers
 * Extracted from agent-coordinator.ts for single-responsibility queue inspection and task polling.
 */

import type { Queue } from 'bullmq';
import {
  AgentPriority,
  type AgentTask,
  type AgentResult,
  type QueueStats,
} from './agent-coordinator-types';

/**
 * Build an AgentTask payload with normalized timeout and priority context.
 */
export function buildAgentTaskPayload(
  agentName: string,
  input: Record<string, unknown>,
  context: Omit<AgentTask['context'], 'priority' | 'timeout'> & {
    priority: AgentPriority;
    timeout?: number;
  },
  defaultTimeoutMs: number,
): AgentTask {
  return {
    agentName,
    input,
    context: {
      tenantId: context.tenantId,
      strategyId: context.strategyId,
      priority: context.priority,
      timeout: context.timeout || defaultTimeoutMs,
      callbackUrl: context.callbackUrl,
    },
  };
}

/**
 * Search across all priority queues for a job's terminal result.
 */
export async function findTaskResultAcrossQueues(
  queues: Iterable<Queue>,
  jobId: string,
): Promise<AgentResult | null> {
  for (const queue of queues) {
    const job = await queue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (state === 'completed') {
        const result = (await job.returnvalue) as AgentResult;
        return result;
      } else if (state === 'failed') {
        return {
          success: false,
          error: job.failedReason || 'Job failed',
          latencyMs: 0,
          agentName: job.data.agentName,
        };
      }
      return null;
    }
  }
  return null;
}

/**
 * Collect waiting, active, completed, and failed counts across all priority queues.
 */
export async function collectAllQueueStats(
  queues: Map<AgentPriority, Queue>,
): Promise<Map<AgentPriority, QueueStats>> {
  const stats = new Map<AgentPriority, QueueStats>();
  for (const [priority, queue] of queues.entries()) {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);
    stats.set(priority, { waiting, active, completed, failed });
  }
  return stats;
}
