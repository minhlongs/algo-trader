/**
 * Agent Coordinator Queue
 * Manages priority-based agent execution using BullMQ v5
 */

import { Queue, type Worker, JobsOptions, type ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import {
  AgentPriority,
  type AgentTask,
  type AgentResult,
  type QueueStats,
} from './agent-coordinator-types';
import {
  QUEUE_DEFINITIONS,
  getConcurrencyForPriority,
  getRateLimitForPriority,
  getDefaultTimeout,
  getDefaultJobOptions,
} from './agent-coordinator-config';
import { createAgentWorker } from './agent-coordinator-worker';

// Re-export types
export { AgentPriority };
export type { AgentTask, AgentResult, QueueStats };

export class AgentCoordinator {
  private queues: Map<AgentPriority, Queue>;
  private connection: Redis;

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl);
    this.queues = new Map();
    this.initQueues();
  }

  private initQueues(): void {
    for (const config of QUEUE_DEFINITIONS) {
      const queue = new Queue(config.name, {
        connection: this.connection as unknown as ConnectionOptions,
        defaultJobOptions: getDefaultJobOptions(config.priority),
      });

      this.queues.set(config.priority, queue);
    }
  }

  /**
   * Submit an agent task to the appropriate priority queue
   */
  async submitTask(
    agentName: string,
    input: Record<string, unknown>,
    context: Omit<AgentTask['context'], 'priority' | 'timeout'> & {
      priority: AgentPriority;
      timeout?: number;
    }
  ): Promise<string> {
    const queue = this.queues.get(context.priority);
    if (!queue) {
      throw new Error(`No queue configured for priority: ${context.priority}`);
    }

    const task: AgentTask = {
      agentName,
      input,
      context: {
        tenantId: context.tenantId,
        strategyId: context.strategyId,
        priority: context.priority,
        timeout: context.timeout || this.getDefaultTimeout(context.priority),
        callbackUrl: context.callbackUrl,
      },
    };

    const jobOptions: JobsOptions = {
      priority: context.priority,
    };

    const job = await queue.add(agentName, task, jobOptions);
    return job.id!;
  }

  /**
   * Get task result by job ID (searches all queues)
   */
  async getTaskResult(jobId: string): Promise<AgentResult | null> {
    for (const queue of this.queues.values()) {
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
        } else {
          // Still processing
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Wait for job to complete (with timeout)
   */
  async waitForResult(jobId: string, timeoutMs: number = 30000): Promise<AgentResult> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const result = await this.getTaskResult(jobId);
      if (result !== null) {
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
  }

  /**
   * Get queue statistics (async in BullMQ v5)
   */
  async getQueueStats(): Promise<Map<AgentPriority, QueueStats>> {
    const stats = new Map<AgentPriority, QueueStats>();
    for (const [priority, queue] of this.queues.entries()) {
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

  /**
   * Start a worker to process jobs from a specific priority queue
   */
  async startWorker(
    priority: AgentPriority,
    processor: (task: AgentTask) => Promise<unknown>
  ): Promise<Worker> {
    const queue = this.queues.get(priority);
    if (!queue) {
      throw new Error(`No queue configured for priority: ${priority}`);
    }

    return createAgentWorker(queue.name, this.connection, priority, processor);
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    await this.connection.quit();
  }

  private getConcurrencyForPriority(priority: AgentPriority): number {
    return getConcurrencyForPriority(priority);
  }

  private getRateLimitForPriority(priority: AgentPriority): number {
    return getRateLimitForPriority(priority);
  }

  private getDefaultTimeout(priority: AgentPriority): number {
    return getDefaultTimeout(priority);
  }
}

// Factory for creating coordinator
export function createAgentCoordinator(redisUrl: string): AgentCoordinator {
  return new AgentCoordinator(redisUrl);
}
