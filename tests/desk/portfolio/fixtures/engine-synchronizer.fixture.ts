import type { CircuitBreakerState, EngineRiskAdapter } from './risk-contract.fixture';

export class EngineSynchronizer {
  constructor(
    private readonly adapters: readonly EngineRiskAdapter[],
    private readonly timeoutMs = 100
  ) {}

  public async broadcastBreaker(state: CircuitBreakerState): Promise<{ success: boolean; latencyMs: number }> {
    const t0 = Date.now();
    const tasks = this.adapters.map(async (adapter) => {
      const p = adapter.notifyCircuitBreaker(state);
      const timer = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.timeoutMs));
      return Promise.race([p, timer]);
    });

    try {
      await Promise.all(tasks);
      if (state.tier === 'REDUCE') {
        await Promise.all(this.adapters.map((a) => a.reducePositions(0.50)));
      } else if (state.tier === 'HALT') {
        await Promise.all(this.adapters.map((a) => a.haltTrading()));
      } else if (state.tier === 'HARD_STOP') {
        await Promise.all(this.adapters.map((a) => a.emergencyHardStop()));
      }
      return { success: true, latencyMs: Date.now() - t0 };
    } catch {
      // Fail closed: enforce hard stop on error
      await Promise.all(this.adapters.map((a) => a.emergencyHardStop()));
      return { success: false, latencyMs: Date.now() - t0 };
    }
  }
}
