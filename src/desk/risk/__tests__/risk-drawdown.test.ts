import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockRedis, resetMockRedis } from './risk.fixtures';

vi.mock('../../../redis', () => ({
  getRedisClient: () => mockRedis,
}));

describe('DrawdownMonitor', () => {
  beforeEach(() => {
    resetMockRedis();
  });

  it('should be constructable with mock Redis', async () => {
    const { DrawdownMonitor } = await import('../drawdown-monitor');
    const monitor = new DrawdownMonitor(mockRedis as any);
    expect(monitor).toBeDefined();
    expect(typeof monitor.recordTrade).toBe('function');
    expect(typeof monitor.getMetrics).toBe('function');
    expect(typeof monitor.canTrade).toBe('function');
  });

  it('should return metrics with initial state', async () => {
    const { DrawdownMonitor } = await import('../drawdown-monitor');
    const monitor = new DrawdownMonitor(mockRedis as any);
    mockRedis.get.mockResolvedValue('0');

    const metrics = await monitor.getMetrics();

    expect(metrics.currentValue).toBeGreaterThanOrEqual(0);
    expect(metrics.peakValue).toBeGreaterThanOrEqual(0);
    expect(metrics.isHalted).toBe(false);
  });

  it('should record trade and update state', async () => {
    const { DrawdownMonitor } = await import('../drawdown-monitor');
    const monitor = new DrawdownMonitor(mockRedis as any);
    mockRedis.hgetall
      .mockResolvedValueOnce({ currentValue: '100', peakValue: '100', consecutiveLosses: '0' })
      .mockResolvedValueOnce({ state: 'ACTIVE' });
    mockRedis.get.mockResolvedValue('0');

    await monitor.recordTrade(-5);

    expect(mockRedis.set).toHaveBeenCalled();
    expect(mockRedis.hset).toHaveBeenCalled();
  });

  it('should track consecutive losses', async () => {
    const { DrawdownMonitor } = await import('../drawdown-monitor');
    const monitor = new DrawdownMonitor(mockRedis as any);
    mockRedis.hgetall
      .mockResolvedValueOnce({ currentValue: '100', peakValue: '100', consecutiveLosses: '2' })
      .mockResolvedValueOnce({ state: 'ACTIVE' });
    mockRedis.get.mockResolvedValue('0');

    await monitor.recordTrade(-3);

    expect(mockRedis.hset).toHaveBeenCalled();
  });

  it('should reset consecutive losses on win', async () => {
    const { DrawdownMonitor } = await import('../drawdown-monitor');
    const monitor = new DrawdownMonitor(mockRedis as any);
    mockRedis.hgetall
      .mockResolvedValueOnce({ currentValue: '100', peakValue: '100', consecutiveLosses: '3' })
      .mockResolvedValueOnce({ state: 'ACTIVE' });
    mockRedis.get.mockResolvedValue('0');

    await monitor.recordTrade(5);

    expect(mockRedis.hset).toHaveBeenCalledWith('drawdown:state', expect.objectContaining({ consecutiveLosses: '0' }));
  });

  it('should allow trading when not halted', async () => {
    const { DrawdownMonitor } = await import('../drawdown-monitor');
    const monitor = new DrawdownMonitor(mockRedis as any);
    mockRedis.hgetall.mockResolvedValueOnce({ state: 'ACTIVE' });

    const canTrade = await monitor.canTrade();

    expect(canTrade).toBe(true);
  });

  it('should block trading when halted', async () => {
    const { DrawdownMonitor } = await import('../drawdown-monitor');
    const monitor = new DrawdownMonitor(mockRedis as any);
    mockRedis.hgetall.mockResolvedValueOnce({ state: 'HALTED', reason: 'Drawdown breach' });

    const canTrade = await monitor.canTrade();

    expect(canTrade).toBe(false);
  });

  it('should resume trading after halt', async () => {
    const { DrawdownMonitor } = await import('../drawdown-monitor');
    const monitor = new DrawdownMonitor(mockRedis as any);
    mockRedis.hgetall.mockResolvedValueOnce({ currentValue: '95', peakValue: '100' });

    await monitor.resume();

    expect(mockRedis.hset).toHaveBeenCalledWith('drawdown:halt', { state: 'ACTIVE', reason: '', triggeredAt: '' });
  });
});
