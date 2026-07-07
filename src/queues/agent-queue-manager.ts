/**
 * Agent Queue Manager
 * Manages a single BullMQ queue for a specific agent tier.
 * Handles job submission, worker startup, and metrics.
 */

import { Queue, Worker, Job, JobsOptions } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import { recordQueueWaitTime as recordQueueWaitTimeMetric } from '../platform/middleware/prometheus-metrics';

export class AgentQueueManager {
  private queue: Queue;
  private connection: Redis;
  private readonly queueName: string;
  private readonly concurrency: number;
  private readonly rateLimit: number;
  private readonly tier: string;

  constructor(redisUrl: string, queueName: string, concurrency: number = 10, rateLimit: number = 50, tier?: string) {
    this.queueName = queueName;
    this.connection = new Redis(redisUrl);
    this.concurrency = concurrency;
    this.rateLimit = rateLimit;
    this.tier = tier || queueName;

    this.queue = new Queue(queueName, {
      connection: this.connection as unknown as ConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: { count: 100, age: 24 * 60 * 60 * 1000 },
        removeOnFail: { count: 500, age: 24 * 60 * 60 * 1000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        // timeout removed for BullMQ v5
      },
    });
  }

  /**
   * Add a job to the queue.
   * @param name Job name (typically agent name)
   * @param data Job payload
   * @param options BullMQ job options (priority, delay, etc.)
   */
  async add(name: string, data: any, options?: JobsOptions): Promise<Job> {
    return await this.queue.add(name, data, options);
  }

  /**
   * Start a worker to process jobs from this queue.
   * @param processor Async function that processes a job and returns result
   */
  async startWorker(processor: (task: any) => Promise<any>): Promise<Worker> {
    return new Worker(
      this.queueName,
      async (job: Job) => {
        const task = job.data;
        try {
          // Record queue wait time (job.timestamp is when it was added)
          const waitSeconds = (Date.now() - job.timestamp) / 1000;
          const priority = job.opts?.priority || 1;
          const agentName = task.agentName || job.name;
          recordQueueWaitTimeMetric(priority, agentName, this.tier, waitSeconds);

          const result = await processor(task);
          return result;
        } catch (error) {
          throw error;
        }
      },
      {
        connection: this.connection as unknown as ConnectionOptions,
        concurrency: this.concurrency,
        limiter: { max: this.rateLimit, duration: 1000 },
        // stalledInterval removed for BullMQ v5
      }
    );
  }

  /**
   * Get queue statistics for monitoring (async in BullMQ v5).
   */
  async getQueueStats(): Promise<{ waiting: number; active: number; completed: number; failed: number }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }

  /**
   * Graceful shutdown.
   */
  async close(): Promise<void> {
    await this.connection.quit();
  }
}
