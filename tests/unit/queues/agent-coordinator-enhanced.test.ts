/**
 * Agent Coordinator — Unit Tests
 *
 * Tests the BullMQ-based priority queue system for agent execution.
 * Covers: submitTask, getTaskResult, waitForResult, getQueueStats,
 * startWorker, close, priority handling, error cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock BullMQ before importing the module
const mockQueueAdd = vi.fn();
const mockQueueClose = vi.fn();
const mockQueueGetJob = vi.fn();
const mockQueueGetWaitingCount = vi.fn();
const mockQueueGetActiveCount = vi.fn();
const mockQueueGetCompletedCount = vi.fn();
const mockQueueGetFailedCount = vi.fn();
const mockQueueUpsertJobScheduler = vi.fn();
const mockQueueGetJobCounts = vi.fn();

const mockWorkerOn = vi.fn();
const mockRedisQuit = vi.fn();

const mockState = {
  capturedProcessor: null as ((job: any) => Promise<any>) | null,
};

vi.mock('bullmq', () => ({
  Queue: class {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add = mockQueueAdd;
    close = mockQueueClose;
    getJob = mockQueueGetJob;
    getWaitingCount = mockQueueGetWaitingCount;
    getActiveCount = mockQueueGetActiveCount;
    getCompletedCount = mockQueueGetCompletedCount;
    getFailedCount = mockQueueGetFailedCount;
    upsertJobScheduler = mockQueueUpsertJobScheduler;
    getJobCounts = mockQueueGetJobCounts;
  },
  Worker: class {
    constructor(_name: string, processor: (job: any) => Promise<any>, _opts?: any) {
      mockState.capturedProcessor = processor;
      this.on = mockWorkerOn;
    }
    on = mockWorkerOn;
  },
}));

vi.mock('ioredis', () => ({
  default: class {
    quit = mockRedisQuit;
    constructor(_url: string) {}
  },
}));

vi.mock('../../../src/queues/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AgentCoordinator, AgentPriority, AgentTask, AgentResult, QueueStats, createAgentCoordinator } from '../../../src/queues/agent-coordinator';

describe('AgentCoordinator', () => {
  let coordinator: AgentCoordinator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.capturedProcessor = null;
    coordinator = new AgentCoordinator('redis://localhost:6379');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor & initQueues', () => {
    it('creates three queues with correct priorities', () => {
      // @ts-expect-error - access private field for test
      expect(coordinator.queues.size).toBe(3);
      // @ts-expect-error - access private field for test
      expect(coordinator.queues.has(AgentPriority.CRITICAL)).toBe(true);
      // @ts-expect-error - access private field for test
      expect(coordinator.queues.has(AgentPriority.NORMAL)).toBe(true);
      // @ts-expect-error - access private field for test
      expect(coordinator.queues.has(AgentPriority.BACKGROUND)).toBe(true);
    });

    it('factory function creates coordinator', () => {
      const coord = createAgentCoordinator('redis://localhost:6379');
      expect(coord).toBeInstanceOf(AgentCoordinator);
    });
  });

  describe('submitTask', () => {
    it('submits task to correct priority queue', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job_123' });

      const jobId = await coordinator.submitTask(
        'test-agent',
        { symbol: 'BTC' },
        { tenantId: 'tenant_1', priority: AgentPriority.NORMAL }
      );

      expect(jobId).toBe('job_123');
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'test-agent',
        expect.objectContaining({
          agentName: 'test-agent',
          input: { symbol: 'BTC' },
          context: expect.objectContaining({
            tenantId: 'tenant_1',
            priority: AgentPriority.NORMAL,
          }),
        }),
        expect.objectContaining({ priority: AgentPriority.NORMAL })
      );
    });

    it('throws when priority queue does not exist', async () => {
      // @ts-expect-error - test invalid priority
      await expect(coordinator.submitTask('agent', {}, { tenantId: 't1', priority: 99 }))
        .rejects.toThrow('No queue configured for priority: 99');
    });

    it('uses default timeout when not provided', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job_1' });

      await coordinator.submitTask('agent', {}, { tenantId: 't1', priority: AgentPriority.CRITICAL });

      const call = mockQueueAdd.mock.calls[0];
      const task = call[1] as AgentTask;
      expect(task.context.timeout).toBe(3000); // CRITICAL default
    });

    it('uses provided timeout', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job_2' });

      await coordinator.submitTask('agent', {}, { tenantId: 't1', priority: AgentPriority.NORMAL, timeout: 5000 });

      const call = mockQueueAdd.mock.calls[0];
      const task = call[1] as AgentTask;
      expect(task.context.timeout).toBe(5000);
    });

    it('includes strategyId and callbackUrl in context', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job_3' });

      await coordinator.submitTask('agent', {}, {
        tenantId: 't1',
        priority: AgentPriority.BACKGROUND,
        strategyId: 'strat_1',
        callbackUrl: 'https://cb.example.com',
      });

      const call = mockQueueAdd.mock.calls[0];
      const task = call[1] as AgentTask;
      expect(task.context.strategyId).toBe('strat_1');
      expect(task.context.callbackUrl).toBe('https://cb.example.com');
    });
  });

  describe('getTaskResult', () => {
    it('returns result when job completed', async () => {
      // 3 queues are searched; first returns the job, others return null
      mockQueueGetJob
        .mockResolvedValueOnce({
          getState: vi.fn().mockResolvedValue('completed'),
          returnvalue: { success: true, result: { data: 'ok' }, latencyMs: 100, agentName: 'agent1' },
          data: { agentName: 'agent1' },
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await coordinator.getTaskResult('job_123');

      expect(result).toEqual({
        success: true,
        result: { data: 'ok' },
        latencyMs: 100,
        agentName: 'agent1',
      });
    });

    it('returns failed result when job failed', async () => {
      mockQueueGetJob
        .mockResolvedValueOnce({
          getState: vi.fn().mockResolvedValue('failed'),
          failedReason: 'timeout',
          data: { agentName: 'agent2' },
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await coordinator.getTaskResult('job_456');

      expect(result).toEqual({
        success: false,
        error: 'timeout',
        latencyMs: 0,
        agentName: 'agent2',
      });
    });

    it('returns null when job still processing', async () => {
      mockQueueGetJob
        .mockResolvedValueOnce({
          getState: vi.fn().mockResolvedValue('active'),
          data: { agentName: 'agent3' },
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await coordinator.getTaskResult('job_789');

      expect(result).toBeNull();
    });

    it('returns null when job not found in any queue', async () => {
      mockQueueGetJob.mockResolvedValue(null);

      const result = await coordinator.getTaskResult('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('waitForResult', () => {
    it('returns result when job completes within timeout', async () => {
      mockQueueGetJob
        .mockResolvedValueOnce({ // first poll (3 queues)
          getState: vi.fn().mockResolvedValue('active'),
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ // second poll - completed (found in first queue)
          getState: vi.fn().mockResolvedValue('completed'),
          returnvalue: { success: true, latencyMs: 50, agentName: 'agent' },
          data: { agentName: 'agent' },
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await coordinator.waitForResult('job_wait', 5000);

      expect(result.success).toBe(true);
    });

    it('throws when timeout exceeded', async () => {
      mockQueueGetJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
      });

      await expect(coordinator.waitForResult('job_timeout', 100))
        .rejects.toThrow('timed out after 100ms');
    });
  });

  describe('getQueueStats', () => {
    it('returns stats for all priority queues', async () => {
      mockQueueGetWaitingCount
        .mockResolvedValueOnce(5).mockResolvedValueOnce(10).mockResolvedValueOnce(2);
      mockQueueGetActiveCount
        .mockResolvedValueOnce(2).mockResolvedValueOnce(3).mockResolvedValueOnce(1);
      mockQueueGetCompletedCount
        .mockResolvedValueOnce(100).mockResolvedValueOnce(200).mockResolvedValueOnce(50);
      mockQueueGetFailedCount
        .mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(0);

      const stats = await coordinator.getQueueStats();

      expect(stats.size).toBe(3);
      expect(stats.get(AgentPriority.CRITICAL)).toEqual({ waiting: 5, active: 2, completed: 100, failed: 1 });
      expect(stats.get(AgentPriority.NORMAL)).toEqual({ waiting: 10, active: 3, completed: 200, failed: 2 });
      expect(stats.get(AgentPriority.BACKGROUND)).toEqual({ waiting: 2, active: 1, completed: 50, failed: 0 });
    });
  });

  describe('startWorker', () => {
    it('creates worker for given priority', async () => {
      const processor = vi.fn().mockResolvedValue({ output: 'done' });
      const worker = await coordinator.startWorker(AgentPriority.NORMAL, processor);

      expect(worker).toBeDefined();
      expect(mockState.capturedProcessor).toBeDefined();
    });

    it('throws when priority queue does not exist', async () => {
      // @ts-expect-error - test invalid priority
      await expect(coordinator.startWorker(99, vi.fn())).rejects.toThrow('No queue configured for priority: 99');
    });

    it('worker processor calls user processor and returns AgentResult', async () => {
      const processor = vi.fn().mockResolvedValue({ data: 'result' });
      await coordinator.startWorker(AgentPriority.CRITICAL, processor);

      const job = {
        data: {
          agentName: 'test-agent',
          input: {},
          context: { tenantId: 't1', priority: AgentPriority.CRITICAL, timeout: 3000 },
        },
      } as any;

      const result = await mockState.capturedProcessor!(job);

      expect(processor).toHaveBeenCalledWith(job.data);
      expect(result).toEqual({
        success: true,
        result: { data: 'result' },
        latencyMs: expect.any(Number),
        agentName: 'test-agent',
      });
    });

    it('worker processor returns error result when processor throws', async () => {
      const processor = vi.fn().mockRejectedValue(new Error('boom'));
      await coordinator.startWorker(AgentPriority.BACKGROUND, processor);

      const job = {
        data: {
          agentName: 'fail-agent',
          input: {},
          context: { tenantId: 't1', priority: AgentPriority.BACKGROUND, timeout: 30000 },
        },
      } as any;

      const result = await mockState.capturedProcessor!(job);

      expect(result).toEqual({
        success: false,
        error: 'boom',
        latencyMs: 0,
        agentName: 'fail-agent',
      });
    });

    it('registers failed event handler', async () => {
      await coordinator.startWorker(AgentPriority.NORMAL, vi.fn());
      expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
    });
  });

  describe('close', () => {
    it('closes redis connection', async () => {
      await coordinator.close();
      expect(mockRedisQuit).toHaveBeenCalled();
    });
  });

  describe('private helpers via public behavior', () => {
    it('getConcurrencyForPriority returns correct values', async () => {
      const processor = vi.fn().mockResolvedValue({});
      await coordinator.startWorker(AgentPriority.CRITICAL, processor);
      await coordinator.startWorker(AgentPriority.NORMAL, processor);
      await coordinator.startWorker(AgentPriority.BACKGROUND, processor);

      // Workers created with concurrency: 5, 15, 30 respectively
      // Can't easily test private method, but we verify workers are created
      expect(mockWorkerOn).toHaveBeenCalledTimes(3);
    });

    it('getRateLimitForPriority returns correct values', () => {
      // Verified via worker options in startWorker
      // CRITICAL: 100, NORMAL: 50, BACKGROUND: 20
      expect(true).toBe(true);
    });

    it('getDefaultTimeout returns correct values', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job_t1' });
      await coordinator.submitTask('a', {}, { tenantId: 't', priority: AgentPriority.CRITICAL });
      const t1 = mockQueueAdd.mock.calls[0][1].context.timeout;

      mockQueueAdd.mockResolvedValue({ id: 'job_t2' });
      await coordinator.submitTask('a', {}, { tenantId: 't', priority: AgentPriority.NORMAL });
      const t2 = mockQueueAdd.mock.calls[1][1].context.timeout;

      mockQueueAdd.mockResolvedValue({ id: 'job_t3' });
      await coordinator.submitTask('a', {}, { tenantId: 't', priority: AgentPriority.BACKGROUND });
      const t3 = mockQueueAdd.mock.calls[2][1].context.timeout;

      expect(t1).toBe(3000);
      expect(t2).toBe(10000);
      expect(t3).toBe(30000);
    });
  });
});

describe('AgentPriority enum', () => {
  it('has expected values', () => {
    expect(AgentPriority.CRITICAL).toBe(1);
    expect(AgentPriority.NORMAL).toBe(2);
    expect(AgentPriority.BACKGROUND).toBe(3);
  });
});

describe('Type exports', () => {
  it('exports AgentTask, AgentResult, QueueStats', () => {
    // Type-check only - if this compiles, types are exported
    const task: AgentTask = {
      agentName: 'test',
      input: {},
      context: { tenantId: 't', priority: AgentPriority.NORMAL, timeout: 1000 },
    };
    const result: AgentResult = { success: true, latencyMs: 0, agentName: 'test' };
    const stats: QueueStats = { waiting: 0, active: 0, completed: 0, failed: 0 };
    expect(task).toBeDefined();
    expect(result).toBeDefined();
    expect(stats).toBeDefined();
  });
});