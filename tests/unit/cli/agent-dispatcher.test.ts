import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelTier } from '../../../src/agents/agent-config';

// Shared mock functions
const addMock = vi.fn();
const startWorkerMock = vi.fn();
const closeMock = vi.fn();
const chatMock = vi.fn();

let mockGatewayInstance: any = null;

// Mock OpenClawGateway
vi.mock('../../../src/workers/openclaw-gateway/client', () => {
  return {
    OpenClawGateway: class {
      chat = chatMock;
      constructor() {
        mockGatewayInstance = this;
      }
    },
  };
});

// Mock AgentQueueManager with shared mocks
vi.mock('../../../src/queues/agent-queue-manager', () => {
  return {
    AgentQueueManager: class {
      add = addMock;
      startWorker = startWorkerMock;
      close = closeMock;
      constructor() {}
    },
  };
});

// Mock circuit-breaker
vi.mock('../../../src/resilience/circuit-breaker', () => ({
  CircuitBreaker: class {
    constructor() {}
    async execute(fn: Function) { return fn(); }
  },
}));

// Mock agent-config
vi.mock('../../../src/agents/agent-config', () => {
  const ModelTier = { TIER1_HAIKU: 'haiku', TIER2_SONNET: 'sonnet', TIER3_OPUS: 'opus' } as const;
  const TIER_CONFIG = {
    [ModelTier.TIER1_HAIKU]: { model: 'haiku', endpoint: 'http://localhost:11436/v1', defaultTimeout: 200, maxConcurrent: 50, queueName: null, rateLimit: 100 },
    [ModelTier.TIER2_SONNET]: { model: 'sonnet', endpoint: 'http://localhost:11435/v1', defaultTimeout: 1000, maxConcurrent: 20, queueName: 'agent-analysis-queue', rateLimit: 50 },
    [ModelTier.TIER3_OPUS]: { model: 'opus', endpoint: 'http://localhost:11434/v1', defaultTimeout: 3000, maxConcurrent: 10, queueName: 'agent-critical-queue', rateLimit: 20 },
  };
  const mockConfigs = [
    { name: 'signal-validator', tier: ModelTier.TIER3_OPUS, priority: 1, timeout: 2000, fallbackTier: ModelTier.TIER2_SONNET },
    { name: 'signal-fusion-engine', tier: ModelTier.TIER2_SONNET, priority: 1, timeout: 500 },
    { name: 'prediction-accuracy-tracker', tier: ModelTier.TIER1_HAIKU, priority: 4, timeout: 100 },
  ];
  return {
    ModelTier,
    TIER_CONFIG,
    getAgentConfig: vi.fn((name: string) => mockConfigs.find(c => c.name === name)),
  };
});

import { ModelTierDispatcher } from '../../../src/cli/agent-dispatcher';

describe('ModelTierDispatcher', () => {
  let dispatcher: ModelTierDispatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatcher = new ModelTierDispatcher('redis://localhost:6379');
  });

  it('Tier1: direct gateway call', async () => {
    chatMock.mockResolvedValue({ result: 'ok' });
    const result = await dispatcher.execute('prediction-accuracy-tracker', {}, { tenantId: 't1' });
    expect(result.success).toBe(true);
    expect(result.modelTier).toBe('haiku');
    expect(chatMock).toHaveBeenCalled();
  });

  it('Tier2: queues and returns jobId', async () => {
    addMock.mockResolvedValue({ id: 'job-456' });
    const result = await dispatcher.execute('signal-fusion-engine', {}, { tenantId: 't1' });
    expect(result.success).toBe(true);
    expect(result.modelTier).toBe('sonnet');
    expect(result.jobId).toBe('job-456');
    expect(chatMock).not.toHaveBeenCalled();
    expect(addMock).toHaveBeenCalled();
  });

  it('Tier3: direct gateway call', async () => {
    chatMock.mockResolvedValue({ result: 'ok' });
    const result = await dispatcher.execute('signal-validator', {}, { tenantId: 't1' });
    expect(result.success).toBe(true);
    expect(result.modelTier).toBe('opus');
    expect(chatMock).toHaveBeenCalled();
  });

  it('unknown agent returns error', async () => {
    const result = await dispatcher.execute('unknown-agent', {}, { tenantId: 't1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown agent');
  });

  it('Tier3 fallback to Tier2 on AbortError (timeout)', async () => {
    chatMock.mockRejectedValue(new DOMException('timeout', 'AbortError'));
    addMock.mockResolvedValue({ id: 'job-fallback' });
    const result = await dispatcher.execute('signal-validator', {}, { tenantId: 't1' });
    expect(result.success).toBe(true);
    expect(result.modelTier).toBe('sonnet');
    expect(result.jobId).toBe('job-fallback');
  });

  it('Tier3 fallback to Tier2 on rate limit 429', async () => {
    chatMock.mockRejectedValue(new Error('429 rate limit'));
    addMock.mockResolvedValue({ id: 'job-fallback' });
    const result = await dispatcher.execute('signal-validator', {}, { tenantId: 't1' });
    expect(result.success).toBe(true);
    expect(result.modelTier).toBe('sonnet');
  });

  it('Tier3 does not fallback on other errors', async () => {
    chatMock.mockRejectedValue(new Error('500 server error'));
    const result = await dispatcher.execute('signal-validator', {}, { tenantId: 't1' });
    expect(result.success).toBe(false);
    expect(result.modelTier).toBe('opus');
  });

  it('startWorkers calls startWorker on queue manager', async () => {
    await dispatcher.startWorkers({
      [ModelTier.TIER2_SONNET]: vi.fn().mockResolvedValue({}),
    });
    expect(startWorkerMock).toHaveBeenCalled();
  });

  it('close closes queue managers', async () => {
    await dispatcher.close();
    expect(closeMock).toHaveBeenCalled();
  });
});
