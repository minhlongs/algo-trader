/**
 * Agent Coordinator Worker Factory
 * Creates and configures BullMQ workers for processing agent queue jobs.
 */

import { Worker, Job, type ConnectionOptions } from 'bullmq';
import type Redis from 'ioredis';
import { logger } from '../shared/utils/logger';
import type { AgentPriority, AgentTask, AgentResult } from './agent-coordinator-types';
import { getConcurrencyForPriority, getRateLimitForPriority } from './agent-coordinator-config';

export function createAgentWorker(
  queueName: string,
  connection: Redis,
  priority: AgentPriority,
  processor: (task: AgentTask) => Promise<unknown>
): Worker {
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const task: AgentTask = job.data;
      try {
        const start = Date.now();
        const result = await processor(task);
        const latency = Date.now() - start;

        return {
          success: true,
          result,
          latencyMs: latency,
          agentName: task.agentName,
        } as AgentResult;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          latencyMs: 0,
          agentName: task.agentName,
        } as AgentResult;
      }
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: getConcurrencyForPriority(priority),
      limiter: {
        max: getRateLimitForPriority(priority),
        duration: 1000,
      },
    }
  );

  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (job) {
      logger.error(`[AgentCoordinator] Job ${job.id} failed`, error.message);
    } else {
      logger.error('[AgentCoordinator] Job failed', error.message);
    }
  });

  return worker;
}
