import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Track mock instances manually
const mockQueueInstances: any[] = [];
const mockWorkerInstances: any[] = [];

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-id-123' }),
    getJob: vi.fn().mockResolvedValue({
      id: 'job-id-123',
      data: { agentName: 'test', input: {}, context: { tenantId: 't1', priority: 2, timeout: 10000 } },
      getState: vi.fn().mockResolvedValue('completed'),
      returnvalue: { success: true, result: 'done', latencyMs: 100, agentName: 'test' },
    }),
    getWaitingCount: vi.fn().mockReturnValue(0),
    getActiveCount: vi.fn().mockReturnValue(0),
    getCompletedCount: vi.fn().mockReturnValue(0),
    getFailedCount: vi.fn().mockReturnValue(0),
  };
}

function createMockWorker() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
}

vi.mock('bullmq', () => {
  const MockQueue = vi.fn().mockImplementation(function(this: any, name: string, config: any) {
    Object.assign(this, createMockQueue());
    this.name = name;
    mockQueueInstances.push(this);
  });
  const MockWorker = vi.fn().mockImplementation(function(this: any) {
    Object.assign(this, createMockWorker());
    mockWorkerInstances.push(this);
  });
  const MockQueueScheduler = vi.fn();
  return { Queue: MockQueue, Worker: MockWorker, QueueScheduler: MockQueueScheduler, Job: {}, JobOptions: {} };
});

vi.mock('ioredis', () => ({
  default: class MockRedis {
    constructor(redisUrl: string) {}
    async quit() {}
  }
}));

import { AgentCoordinator, AgentPriority, createAgentCoordinator } from '../../../src/queues/agent-coordinator';

describe('AgentCoordinator', () => {
  let coordinator: AgentCoordinator;
  const redisUrl = 'redis://localhost:6379';

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueInstances.length = 0;
    mockWorkerInstances.length = 0;
    coordinator = createAgentCoordinator(redisUrl);
  });

  afterEach(async () => {
    await coordinator.close();
  });

  describe('initialization', () => {
    it('should create coordinator instance', () => {
      expect(coordinator).toBeInstanceOf(AgentCoordinator);
    });
  });

  describe('submitTask', () => {
    it('should return a job ID', async () => {
      const jobId = await coordinator.submitTask('agent', {}, { tenantId: 't1', priority: AgentPriority.NORMAL });
      expect(jobId).toBe('job-id-123');
    });

    it('should throw for invalid priority', async () => {
      await expect(coordinator.submitTask('a', {}, { tenantId: 't1', priority: 0 })).rejects.toThrow();
    });
  });

  describe('getTaskResult', () => {
    it('should return completed result', async () => {
      const result = await coordinator.getTaskResult('job-id-123');
      expect(result?.success).toBe(true);
      expect(result?.result).toBe('done');
    });

    it('should return null for non-existent job', async () => {
      // Override all queue instances to return null for this job
      mockQueueInstances.forEach(q => {
        q.getJob = vi.fn().mockResolvedValue(null);
      });
      const result = await coordinator.getTaskResult('missing');
      expect(result).toBeNull();
    });
  });

  describe('waitForResult', () => {
    it('should resolve with result', async () => {
      const result = await coordinator.waitForResult('job', 5000);
      expect(result.success).toBe(true);
    });
  });

  describe('getQueueStats', () => {
    it('should return a Map with stats for all priorities', () => {
      const stats = coordinator.getQueueStats();
      expect(stats instanceof Map).toBe(true);
      expect(stats.size).toBe(3);
    });
  });

  describe('startWorker', () => {
    it('should return a worker instance', async () => {
      const worker = await coordinator.startWorker(AgentPriority.NORMAL, async () => ({}));
      expect(worker).toBeDefined();
    });
  });

  describe('close', () => {
    it('should close Redis connection without error', async () => {
      await expect(coordinator.close()).resolves.not.toThrow();
    });
  });
});
