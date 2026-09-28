import { describe, expect, it } from 'vitest';
import { EngineSynchronizer } from '../engine-synchronizer';
import type {
  CircuitBreakerState,
  EngineId,
  EngineRiskAdapter,
} from '../portfolio-risk-types';

class MockAdapter implements EngineRiskAdapter {
  public receivedStates: CircuitBreakerState[] = [];
  public reductionFactors: number[] = [];
  public isHalted = false;
  public isHardStopped = false;

  constructor(public readonly engineId: EngineId) {}

  public async notifyCircuitBreaker(state: CircuitBreakerState): Promise<void> {
    this.receivedStates.push(state);
  }

  public async reducePositions(factor: number): Promise<void> {
    this.reductionFactors.push(factor);
  }

  public async haltTrading(): Promise<void> {
    this.isHalted = true;
  }

  public async emergencyHardStop(): Promise<void> {
    this.isHardStopped = true;
  }
}

describe('engine-synchronizer 100ms Fail-Closed Broadcast', () => {
  it('synchronously broadcasts circuit breaker state to all 4 engine adapters', async () => {
    const adapters = [
      new MockAdapter('arbitrage'),
      new MockAdapter('marl'),
      new MockAdapter('amm'),
      new MockAdapter('alpha-lab'),
    ];
    const synchronizer = new EngineSynchronizer(adapters, 100);
    const res = await synchronizer.broadcastBreaker({
      tier: 'ALERT',
      peakToTroughDrawdown: 0.06,
      meanCorrelation: 0.3,
      grossLeverage: 1.0,
      triggeredAt: Date.now(),
      reason: 'Alert test',
    });

    expect(res.success).toBe(true);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    adapters.forEach((a) => expect(a.receivedStates.length).toBe(1));
  });

  it('triggers reducePositions(0.50) across all engines during REDUCE tier', async () => {
    const adapters = [new MockAdapter('arbitrage'), new MockAdapter('marl')];
    const synchronizer = new EngineSynchronizer(adapters);
    await synchronizer.broadcastBreaker({
      tier: 'REDUCE',
      peakToTroughDrawdown: 0.11,
      meanCorrelation: 0.4,
      grossLeverage: 1.0,
      triggeredAt: Date.now(),
      reason: 'Reduce test',
    });
    adapters.forEach((a) => expect(a.reductionFactors).toContain(0.5));
  });

  it('triggers haltTrading() across all engines during HALT tier', async () => {
    const adapters = [new MockAdapter('amm'), new MockAdapter('alpha-lab')];
    const synchronizer = new EngineSynchronizer(adapters);
    await synchronizer.broadcastBreaker({
      tier: 'HALT',
      peakToTroughDrawdown: 0.16,
      meanCorrelation: 0.5,
      grossLeverage: 1.0,
      triggeredAt: Date.now(),
      reason: 'Halt test',
    });
    adapters.forEach((a) => expect(a.isHalted).toBe(true));
  });

  it('triggers emergencyHardStop() across all engines during HARD_STOP tier', async () => {
    const adapters = [new MockAdapter('arbitrage')];
    const synchronizer = new EngineSynchronizer(adapters);
    await synchronizer.broadcastBreaker({
      tier: 'HARD_STOP',
      peakToTroughDrawdown: 0.22,
      meanCorrelation: 0.5,
      grossLeverage: 1.0,
      triggeredAt: Date.now(),
      reason: 'Hard stop',
    });
    expect(adapters[0].isHardStopped).toBe(true);
  });

  it('enforces fail-closed behavior on timeout (> 50ms)', async () => {
    const slowAdapter = new MockAdapter('marl');
    slowAdapter.notifyCircuitBreaker = () => new Promise((resolve) => setTimeout(resolve, 150));
    const synchronizer = new EngineSynchronizer([slowAdapter], 50);

    const res = await synchronizer.broadcastBreaker({
      tier: 'ALERT',
      peakToTroughDrawdown: 0.05,
      meanCorrelation: 0.3,
      grossLeverage: 1.0,
      triggeredAt: Date.now(),
      reason: 'Slow test',
    });

    expect(res.success).toBe(false);
    expect(slowAdapter.isHardStopped).toBe(true);
    expect(synchronizer.getIsolatedEngines()).toContain('marl');
  });

  it('broadcast with 0 adapters succeeds immediately without error', async () => {
    const synchronizer = new EngineSynchronizer([]);
    const res = await synchronizer.broadcastBreaker({
      tier: 'NORMAL',
      peakToTroughDrawdown: 0,
      meanCorrelation: 0.1,
      grossLeverage: 1.0,
      triggeredAt: Date.now(),
      reason: 'empty test',
    });
    expect(res.success).toBe(true);
  });

  it('single failing adapter triggers emergency hard stop on all adapters', async () => {
    const okAdapter = new MockAdapter('marl');
    const failAdapter = new MockAdapter('amm');
    failAdapter.notifyCircuitBreaker = async () => {
      throw new Error('Connection reset');
    };

    const synchronizer = new EngineSynchronizer([okAdapter, failAdapter]);
    const res = await synchronizer.broadcastBreaker({
      tier: 'ALERT',
      peakToTroughDrawdown: 0.05,
      meanCorrelation: 0.2,
      grossLeverage: 1.0,
      triggeredAt: Date.now(),
      reason: 'crash test',
    });

    expect(res.success).toBe(false);
    expect(okAdapter.isHardStopped).toBe(true);
    expect(failAdapter.isHardStopped).toBe(true);
  });

  it('resets isolated engines list properly', () => {
    const synchronizer = new EngineSynchronizer([]);
    synchronizer.resetIsolatedEngines();
    expect(synchronizer.getIsolatedEngines()).toEqual([]);
  });
});
