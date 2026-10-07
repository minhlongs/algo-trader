import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mockRedis, resetMockRedis } from './risk.fixtures';
import { CircuitBreaker } from '../circuit-breaker';

vi.mock('../../../redis', () => ({ getRedisClient: () => mockRedis }));
vi.mock('../circuit-breaker-audit', () => ({
  logCircuitBreakerTripped: vi.fn().mockResolvedValue(undefined),
  logCircuitBreakerReset: vi.fn().mockResolvedValue(undefined),
}));

describe('CircuitBreaker Unit Tests', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    resetMockRedis();
    cb = new CircuitBreaker(mockRedis as any, {
      maxLossStreak: 3,
      maxLatencyMs: 1000,
      maxVolatilityPercent: 0.05,
      maxDailyDrawdown: 0.05,
      cooldownMs: 50,
    });
  });

  it('starts in CLOSED state and allows trading', async () => {
    mockRedis.hgetall.mockResolvedValueOnce({ state: 'CLOSED' });
    const status = await cb.getStatus();
    expect(status.state).toBe('CLOSED');
    expect(await cb.canTrade()).toBe(true);
    expect(cb.getSyncStatus().state).toBe('CLOSED');
  });

  it('trips to OPEN state upon reaching max consecutive losses', async () => {
    mockRedis.get.mockResolvedValueOnce('0').mockResolvedValueOnce('1').mockResolvedValueOnce('2');
    await cb.recordLoss();
    await cb.recordLoss();
    await cb.recordLoss(); // 3rd consecutive loss

    expect(mockRedis.hset).toHaveBeenCalledWith('circuit_breaker:status', expect.objectContaining({ state: 'OPEN' }));
    expect(cb.getSyncStatus().state).toBe('OPEN');
    expect(cb.getSyncStatus().reason).toContain('Loss streak');
  });

  it('resets loss streak on recordWin', async () => {
    await cb.recordLoss();
    await cb.recordWin();
    expect(mockRedis.del).toHaveBeenCalledWith('circuit_breaker:loss_streak');
  });

  it('trips on latency spike exceeding max threshold', async () => {
    const allowed = await cb.checkLatency(1500);
    expect(allowed).toBe(false);
    expect(cb.getSyncStatus().state).toBe('OPEN');
    expect(cb.getSyncStatus().reason).toContain('Latency spike');
  });

  it('trips on excessive volatility', async () => {
    const allowed = await cb.checkVolatility(0.08);
    expect(allowed).toBe(false);
    expect(cb.getSyncStatus().state).toBe('OPEN');
    expect(cb.getSyncStatus().reason).toContain('High volatility');
  });

  it('supports manual halt and explicit reset', async () => {
    await cb.halt('Emergency operator shutdown');
    expect(cb.getSyncStatus().state).toBe('OPEN');

    await cb.reset();
    expect(cb.getSyncStatus().state).toBe('CLOSED');
  });

  it('transitions to HALF_OPEN after cooldown expires', async () => {
    await cb.halt('Temporary pause');
    expect(cb.getSyncStatus().state).toBe('OPEN');

    await new Promise((resolve) => setTimeout(resolve, 60));
    const syncStatus = cb.getSyncStatus();
    expect(syncStatus.state).toBe('HALF_OPEN');
  });
});
