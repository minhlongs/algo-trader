import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedisClient = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  hget: vi.fn().mockResolvedValue(null),
  publish: vi.fn().mockResolvedValue(1),
};

vi.mock('../../src/redis', () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));

vi.mock('../../src/middleware/prometheus-metrics', () => ({
  setQwenKillSwitch: vi.fn(),
  setQwenDrawdownAutoDisabled: vi.fn(),
  setQwenPaperGateDaysRemaining: vi.fn(),
}));

vi.mock('../../src/shared/utils/tracing', () => ({
  getTracer: vi.fn(() => ({
    startActiveSpan: vi.fn((name: string, fn: any) => fn({ setAttribute: vi.fn() })),
    startSpan: vi.fn(() => ({
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    })),
  })),
}));

vi.mock('../../src/shared/messaging/create-message-bus', () => ({
  getMessageBus: vi.fn(() => ({
    subscribe: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { TieredRollbackController } from '../../src/rollback/tiered-rollback-controller';

describe('Debug Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.QWEN_KILL;
    delete process.env.QWEN_LIVE_ELIGIBLE;
  });

  it('debug status', async () => {
    const now = Date.now();
    const thirtyOneDaysAgo = now - 31 * 86400000;
    
    const redisValues: Record<string, string | null> = {
      'Standard:signals:last_run_ts': now.toString(),
      'Standard:kill:active': null,
      'Standard:disabled': null,
      'fable-5:drawdown:tier': null,
      'Standard:paper:ineligible': null,
      'Standard:paper:first_trade_age_ms': thirtyOneDaysAgo.toString(),
    };
    
    mockRedisClient.get = vi.fn(async (key: string) => {
      const val = redisValues[key] ?? null;
      return val;
    });
    mockRedisClient.hget = vi.fn(async (_key: string, _field: string) => null);

    const controller = new TieredRollbackController({
      signalStalenessMs: 7 * 60 * 60 * 1000,
      paperGateMinDays: 30,
    });

    const status = await controller.getStatus();
    console.log('STATUS:', JSON.stringify(status, null, 2));
    expect(status.overall).toBe('ACTIVE');
  });
});
