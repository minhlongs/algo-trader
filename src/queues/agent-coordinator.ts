import type { ConnectionOptions } from 'bullmq';

/**
 * Agent Coordinator Queue
 * Manages priority-based agent execution using BullMQ v5
 */

import { Queue, Worker, Job, JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../shared/utils/logger';

export enum AgentPriority {
  CRITICAL = 1,   // Tier 1 - bypass queue if possible, fast path
  NORMAL = 2,     // Tier 2 - standard queued processing
  BACKGROUND = 3, // Tier 3 - best effort, can be delayed
}

export interface AgentTask {
  agentName: string;
  input: Record<string, unknown>;
  context: {
    tenantId: string;
    strategyId?: string;
    priority: AgentPriority;
    timeout: number; // ms
    callbackUrl?: string; // For async result delivery
  };
}

export interface AgentResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  latencyMs: number;
  agentName: string;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export class AgentCoordinator {
  private queues: Map<AgentPriority, Queue>;
  private connection: Redis;

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl);
    this.queues = new Map();
    this.initQueues();
  }

  private initQueues(): void {
    const queueConfigs = [
      {
        priority: AgentPriority.CRITICAL,
        name: 'agent-critical',
        concurrency: 5,
        rateLimit: 100, // per second
      },
      {
        priority: AgentPriority.NORMAL,
        name: 'agent-normal',
        concurrency: 15,
        rateLimit: 50,
      },
      {
        priority: AgentPriority.BACKGROUND,
        name: 'agent-background',
        concurrency: 30,
        rateLimit: 20,
      },
    ];

    for (const config of queueConfigs) {
      const queue = new Queue(config.name, {
        connection: this.connection as unknown as ConnectionOptions,
        defaultJobOptions: {
          removeOnComplete: { count: 100, age: 24 * 60 * 60 * 1000 },
          removeOnFail: { count: 500, age: 24 * 60 * 60 * 1000 },
          attempts: config.priority === AgentPriority.CRITICAL ? 1 : 3,
          backoff: {
            type: 'exponential',
            delay: config.priority === AgentPriority.BACKGROUND ? 10000 : 2000,
          },
          // timeout removed for BullMQ v5
        },
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
    // Search all queues for the job
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === 'completed') {
          const result = await job.returnvalue as AgentResult;
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
      await new Promise(resolve => setTimeout(resolve, 100));
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

    const worker = new Worker(
      queue.name,
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
        connection: this.connection as unknown as ConnectionOptions,
        concurrency: this.getConcurrencyForPriority(priority),
        limiter: {
          max: this.getRateLimitForPriority(priority),
          duration: 1000,
        },
        // stalledInterval removed for BullMQ v5 compatibility
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

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    // Close all workers would need tracking - simplified version
    await this.connection.quit();
  }

  private getConcurrencyForPriority(priority: AgentPriority): number {
    switch (priority) {
      case AgentPriority.CRITICAL: return 5;
      case AgentPriority.NORMAL: return 15;
      case AgentPriority.BACKGROUND: return 30;
    }
  }

  private getRateLimitForPriority(priority: AgentPriority): number {
    switch (priority) {
      case AgentPriority.CRITICAL: return 100;
      case AgentPriority.NORMAL: return 50;
      case AgentPriority.BACKGROUND: return 20;
    }
  }

  private getDefaultTimeout(priority: AgentPriority): number {
    switch (priority) {
      case AgentPriority.CRITICAL: return 3000;
      case AgentPriority.NORMAL: return 10000;
      case AgentPriority.BACKGROUND: return 30000;
    }
  }
}

// Factory for creating coordinator
export function createAgentCoordinator(redisUrl: string): AgentCoordinator {
  return new AgentCoordinator(redisUrl);
}
