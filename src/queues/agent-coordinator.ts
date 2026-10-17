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
import {
  buildAgentTaskPayload,
  findTaskResultAcrossQueues,
  collectAllQueueStats,
} from './agent-coordinator-dispatch-helpers';

// Re-export types and helpers
export { AgentPriority };
export type { AgentTask, AgentResult, QueueStats };
export { buildAgentTaskPayload, findTaskResultAcrossQueues, collectAllQueueStats };

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

    const task = buildAgentTaskPayload(
      agentName,
      input,
      context,
      this.getDefaultTimeout(context.priority),
    );
    const jobOptions: JobsOptions = { priority: context.priority };
    const job = await queue.add(agentName, task, jobOptions);
    return job.id!;
  }

  /**
   * Get task result by job ID (searches all queues)
   */
  async getTaskResult(jobId: string): Promise<AgentResult | null> {
    return findTaskResultAcrossQueues(this.queues.values(), jobId);
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
    return collectAllQueueStats(this.queues);
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
