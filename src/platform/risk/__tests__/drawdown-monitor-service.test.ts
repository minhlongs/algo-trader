/**
 * Drawdown Monitor Service Tests — Core Functionality
 * Validates trade recording, metrics calculation, halt checks, resume, and day initialization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawdownMonitorService } from '../drawdown-monitor-service';
import { makeRedis } from './drawdown-monitor-service-fixtures';
import type { RedisClientType } from '../../../redis';

describe('DrawdownMonitorService — Core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records trade and returns metrics', async () => {
    const service = new DrawdownMonitorService(makeRedis() as unknown as RedisClientType);
    const metrics = await service.recordTrade(5);

    expect(metrics.currentValue).toBe(105);
    expect(metrics.peakValue).toBe(105);
    expect(metrics.consecutiveLosses).toBe(0);
  });

  it('tracks consecutive losses', async () => {
    const service = new DrawdownMonitorService(makeRedis() as unknown as RedisClientType);
    await service.recordTrade(-10);
    await service.recordTrade(-5);

    const metrics = await service.getStatus('user-1');
    expect(metrics.data.consecutiveLosses).toBe(2);
  });

  it('resets consecutive losses on win', async () => {
    const service = new DrawdownMonitorService(makeRedis() as unknown as RedisClientType);
    await service.recordTrade(-10);
    await service.recordTrade(15);

    const metrics = await service.getStatus('user-1');
    expect(metrics.data.consecutiveLosses).toBe(0);
  });

  it('getStatus returns metrics with history and alerts', async () => {
    const service = new DrawdownMonitorService(makeRedis() as unknown as RedisClientType);
    const status = await service.getStatus('user-1');

    expect(status.success).toBe(true);
    expect(status.data.history).toBeDefined();
    expect(status.data.alerts).toBeDefined();
  });

  it('canTrade returns false when halted', async () => {
    const service = new DrawdownMonitorService(makeRedis({
      hgetall: vi.fn().mockResolvedValue({ state: 'HALTED', reason: 'test', triggeredAt: String(Date.now()) }),
    }) as unknown as RedisClientType);
    expect(await service.canTrade()).toBe(false);
  });

  it('canTrade returns true when active', async () => {
    const service = new DrawdownMonitorService(makeRedis() as unknown as RedisClientType);
    expect(await service.canTrade()).toBe(true);
  });

  it('resumes from halted state', async () => {
    const mockHset = vi.fn().mockResolvedValue('OK');
    const mockGet = vi.fn()
      .mockImplementation((key: string) => key === 'drawdown:daily_start'
        ? Promise.resolve('100') : Promise.resolve(null));

    const redis = makeRedis({
      hgetall: vi.fn().mockResolvedValue({ state: 'HALTED', reason: 'test', triggeredAt: String(Date.now()) }),
      hset: mockHset,
      get: mockGet,
    });
    const service = new DrawdownMonitorService(redis as unknown as RedisClientType);
    await service.resume();

    expect(mockHset).toHaveBeenCalledWith(
      'drawdown:halt',
      expect.objectContaining({ state: 'ACTIVE' }),
    );
  });

  it('initializes day tracking', async () => {
    const mockSet = vi.fn().mockResolvedValue('OK');
    const mockDel = vi.fn().mockResolvedValue(1);
    const service = new DrawdownMonitorService(makeRedis({ set: mockSet, del: mockDel }) as unknown as RedisClientType);
    await service.initializeDay();
    expect(mockSet).toHaveBeenCalled();
  });
});
