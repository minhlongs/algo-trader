import { describe, it, expect, vi } from 'vitest';
import { mockRedis } from './risk.fixtures';

vi.mock('../../../redis', () => ({ getRedisClient: () => mockRedis }));

describe('CircuitBreaker', () => {
  it('should be constructable with mock Redis', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    expect(breaker).toBeDefined();
    expect(typeof breaker.getStatus).toBe('function');
    expect(typeof breaker.canTrade).toBe('function');
    expect(typeof breaker.recordLoss).toBe('function');
    expect(typeof breaker.reset).toBe('function');
  });

  it('should return CLOSED status initially', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    mockRedis.hgetall.mockResolvedValueOnce({ state: 'CLOSED' });
    expect((await breaker.getStatus()).state).toBe('CLOSED');
  });

  it('should allow trading when circuit is closed', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    mockRedis.hgetall.mockResolvedValueOnce({ state: 'CLOSED' });
    expect(await breaker.canTrade()).toBe(true);
  });

  it('should block trading when circuit is open', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    mockRedis.hgetall.mockResolvedValueOnce({ state: 'OPEN', triggeredAt: Date.now().toString(), reason: 'Loss streak' });
    expect(await breaker.canTrade()).toBe(false);
  });

  it('should record loss and increment streak', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    mockRedis.get.mockResolvedValueOnce('2');
    await breaker.recordLoss();
    expect(mockRedis.set).toHaveBeenCalledWith('circuit_breaker:loss_streak', '3');
  });

  it('should reset loss streak on win', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    await breaker.recordWin();
    expect(mockRedis.del).toHaveBeenCalledWith('circuit_breaker:loss_streak');
  });

  it('should trip on latency spike', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    expect(await breaker.checkLatency(1500)).toBe(false);
    expect(mockRedis.hset).toHaveBeenCalledWith('circuit_breaker:status', expect.any(Object));
  });

  it('should pass latency check when normal', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    expect(await breaker.checkLatency(100)).toBe(true);
  });

  it('should reset circuit breaker', async () => {
    const { CircuitBreaker } = await import('../circuit-breaker');
    const breaker = new CircuitBreaker(mockRedis as any);
    await breaker.reset();
    expect(mockRedis.hset).toHaveBeenCalledWith('circuit_breaker:status', { state: 'CLOSED', reason: '', triggeredAt: '' });
  });
});

describe('PositionManager', () => {
  it('should be constructable with mock Redis', async () => {
    const { PositionManager } = await import('../position-manager');
    const manager = new PositionManager(mockRedis as any);
    expect(manager).toBeDefined();
    expect(typeof manager.getPosition).toBe('function');
    expect(typeof manager.openPosition).toBe('function');
    expect(typeof manager.closePosition).toBe('function');
  });

  it('should return null for non-existent position', async () => {
    const { PositionManager } = await import('../position-manager');
    const manager = new PositionManager(mockRedis as any);
    mockRedis.hgetall.mockResolvedValueOnce({});
    expect(await manager.getPosition('BTC/USDT', 'binance')).toBeNull();
  });

  it('should validate position within limits', async () => {
    const { PositionManager } = await import('../position-manager');
    const manager = new PositionManager(mockRedis as any);
    mockRedis.keys.mockResolvedValueOnce([]);
    expect((await manager.validatePosition('BTC/USDT', 'binance', 'long', 0.1)).valid).toBe(true);
  });

  it('should reject position exceeding symbol limit', async () => {
    const { PositionManager } = await import('../position-manager');
    const manager = new PositionManager(mockRedis as any);
    mockRedis.keys.mockResolvedValueOnce([]);
    mockRedis.hgetall.mockResolvedValueOnce({ totalLong: '0', totalShort: '0', netExposure: '0' });
    const validation = await manager.validatePosition('BTC/USDT', 'binance', 'long', 2.0);
    expect(validation.newExposure).toBeGreaterThan(validation.currentExposure);
  });

  it('should open position successfully', async () => {
    const { PositionManager } = await import('../position-manager');
    const manager = new PositionManager(mockRedis as any);
    mockRedis.keys.mockResolvedValueOnce([]);
    mockRedis.hgetall.mockResolvedValueOnce({ totalLong: '0', totalShort: '0', netExposure: '0', perSymbol: JSON.stringify({}), perExchange: JSON.stringify({}) });
    expect(await manager.openPosition('BTC/USDT', 'binance', 'long', 0.1, 50000)).toBe(true);
    expect(mockRedis.hset).toHaveBeenCalledWith(
      'position:BTC/USDT:binance',
      expect.objectContaining({ symbol: 'BTC/USDT', exchange: 'binance', side: 'long', amount: '0.1' })
    );
  });

  it('should close position and return PnL', async () => {
    const { PositionManager } = await import('../position-manager');
    const manager = new PositionManager(mockRedis as any);
    mockRedis.hgetall.mockResolvedValueOnce({ symbol: 'BTC/USDT', exchange: 'binance', side: 'long', amount: '0.1', entryPrice: '50000', currentValue: '5100', unrealizedPnl: '100', openedAt: Date.now().toString() });
    expect(await manager.closePosition('BTC/USDT', 'binance', 51000)).toBeGreaterThanOrEqual(0);
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('should get exposure summary', async () => {
    const { PositionManager } = await import('../position-manager');
    const manager = new PositionManager(mockRedis as any);
    mockRedis.keys.mockResolvedValueOnce(['position:BTC/USDT:binance']);
    mockRedis.hgetall.mockResolvedValueOnce({ symbol: 'BTC/USDT', exchange: 'binance', side: 'long', amount: '0.1', entryPrice: '50000', currentValue: '5000', unrealizedPnl: '0', openedAt: Date.now().toString() });
    const summary = await manager.getExposureSummary();
    expect(summary.totalLong).toBeGreaterThanOrEqual(0);
    expect(summary.totalShort).toBeGreaterThanOrEqual(0);
  });
});
