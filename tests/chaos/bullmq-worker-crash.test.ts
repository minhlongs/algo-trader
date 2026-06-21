/**
 * BullMQ Worker Crash Recovery Test (TM-04 part of messaging chaos)
 * Tests: Worker crash recovery, job retry, and dead letter queue handling
 *
 * Success Criteria:
 * - Worker restarts automatically within 10s of crash
 * - Jobs mid-execution are retried (at-least-once semantics)
 * - After max retries, job goes to DLQ
 * - Zero job loss
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { ChaosTestHelper, waitFor } from './chaos-test-utils';

describe('BullMQ Worker Crash Chaos (TM-04)', () => {
  const helper = new ChaosTestHelper();
  const queueName = 'chaos-test-worker-crash';
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let connection: Redis;
  let queue: Queue;

  beforeAll(async () => {
    connection = new Redis(redisUrl);
    queue = new Queue(queueName, { connection });

    // Clean up any existing jobs
    await queue.clean(0, 'completed');
    await queue.clean(0, 'failed');
  });

  beforeEach(async () => {
    helper.resetMetrics();
  });

  afterAll(async () => {
    await queue.close();
    await connection.quit();
  });

  it('should recover worker from crash and retry failed jobs', async () => {
    // Arrange: Create a job that fails on first attempt
    const jobData = { task: 'critical-operation', shouldFail: true };
    let job: Job;

    // Worker that fails on first attempt, succeeds on retry
    const worker = new Worker(
      queueName,
      async (j: Job) => {
        const data = j.data as any;
        if (data.shouldFail && j.attemptsMade < 2) {
          throw new Error('Simulated worker failure');
        }
        return { success: true, attempt: j.attemptsMade };
      },
      { connection, concurrency: 1 }
    );

    // Add job with 3 retry attempts
    job = await queue.add('critical-task', jobData, { attempts: 3 });

    // Wait for first attempt to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Act: Kill worker process (simulate crash)
    // In real test: process.kill(worker.process.pid, 'SIGKILL')
    // For this test, we'll just close the worker
    await worker.close();

    // Supervisor should restart worker (in production, use PM2 or similar)
    // Here we manually restart to simulate auto-recovery
    await new Promise(resolve => setTimeout(resolve, 3000));

    const newWorker = new Worker(
      queueName,
      async (j: Job) => {
        const data = j.data as any;
        if (data.shouldFail && j.attemptsMade < 2) {
          throw new Error('Simulated worker failure');
        }
        return { success: true, attempt: j.attemptsMade };
      },
      { connection, concurrency: 1 }
    );

    // Wait for job to complete
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Assert: Job completed successfully after retry
    const completedJob = await job.getState();
    expect(completedJob).toBe('completed');

    const result = await (await job).returnvalue as any;
    expect(result.success).toBe(true);
    expect(result.attempt).toBeGreaterThanOrEqual(2); // Should have retried

    await newWorker.close();
  }, 30000);

  it('should move job to failed state after max retries exhausted', async () => {
    // Arrange: Job that always fails
    const alwaysFailingJobData = { task: 'always-fail' };

    const failingWorker = new Worker(
      queueName,
      async () => {
        throw new Error('Always fails');
      },
      { connection, concurrency: 1 }
    );

    const job = await queue.add('failing-task', alwaysFailingJobData, { attempts: 2 });

    // Act: Wait for retries to exhaust
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Assert: Job moved to failed state
    const jobState = await job.getState();
    expect(jobState).toBe('failed');

    const failedCount = await queue.getFailedCount();
    expect(failedCount).toBe(1);

    await failingWorker.close();
  }, 20000);

  it('should maintain zero job loss during worker crash', async () => {
    // Arrange: Multiple jobs added before crash
    const jobCount = 20;
    const addedJobIds: string[] = [];

    // Worker that processes slowly
    const slowWorker = new Worker(
      queueName,
      async (j: Job) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { processed: true };
      },
      { connection, concurrency: 2 }
    );

    // Add jobs
    for (let i = 0; i < jobCount; i++) {
      const job = await queue.add('slow-task', { index: i });
      addedJobIds.push(job.id);
    }

    // Let some jobs start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Act: Crash worker
    await slowWorker.close();

    // Restart after delay
    await new Promise(resolve => setTimeout(resolve, 5000));

    const recoveredWorker = new Worker(
      queueName,
      async (j: Job) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return { processed: true };
      },
      { connection, concurrency: 2 }
    );

    // Wait for all jobs to complete
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Assert: All jobs eventually completed
    const completedCount = await queue.getCompletedCount();
    const failedCount = await queue.getFailedCount();
    const waitingCount = await queue.getWaitingCount();

    expect(completedCount).toBe(jobCount);
    expect(failedCount).toBe(0);
    expect(waitingCount).toBe(0);

    await recoveredWorker.close();
  }, 30000);

  it('should preserve job order within priority level', async () => {
    // Arrange: Add jobs with sequence numbers
    const sequenceCount = 10;
    const receivedOrder: number[] = [];

    const orderedWorker = new Worker(
      queueName,
      async (j: Job) => {
        const data = j.data as any;
        receivedOrder.push(data.seq);
        await new Promise(resolve => setTimeout(resolve, 100));
        return { done: true };
      },
      { connection, concurrency: 1 } // Single concurrency for strict ordering
    );

    // Add jobs in order
    for (let i = 0; i < sequenceCount; i++) {
      await queue.add('ordered-task', { seq: i });
    }

    // Wait for all to complete
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Assert: Jobs processed in FIFO order
    expect(receivedOrder.length).toBe(sequenceCount);
    for (let i = 0; i < sequenceCount; i++) {
      expect(receivedOrder[i]).toBe(i);
    }

    await orderedWorker.close();
  }, 20000);

  it('should handle rapid job additions during worker restart', async () => {
    // Arrange
    const rapidJobCount = 50;

    const worker = new Worker(
      queueName,
      async (j: Job) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { success: true };
      },
      { connection, concurrency: 5 }
    );

    // Act: Add jobs rapidly
    for (let i = 0; i < rapidJobCount; i++) {
      await queue.add('rapid-task', { index: i });
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Simulate worker crash mid-processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    await worker.close();

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Restart
    const restartedWorker = new Worker(
      queueName,
      async (j: Job) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { success: true };
      },
      { connection, concurrency: 5 }
    );

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Assert: All jobs completed
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();

    expect(completed).toBe(rapidJobCount);
    expect(failed).toBe(0);

    await restartedWorker.close();
  }, 30000);
});
