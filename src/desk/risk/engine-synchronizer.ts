import { logger } from '../../shared/utils/logger';
import type { CircuitBreakerState, EngineRiskAdapter } from './portfolio-risk-types';

export interface SynchronizerResult {
  readonly success: boolean;
  readonly latencyMs: number;
  readonly failedEngines?: readonly string[];
}

export class EngineSynchronizer {
  private readonly isolatedEngines = new Set<string>();

  constructor(
    private readonly adapters: readonly EngineRiskAdapter[],
    private readonly timeoutMs: number = 100
  ) {}

  public getAdapters(): readonly EngineRiskAdapter[] {
    return this.adapters;
  }

  public getIsolatedEngines(): readonly string[] {
    return Array.from(this.isolatedEngines);
  }

  public async broadcastBreaker(state: CircuitBreakerState): Promise<SynchronizerResult> {
    const t0 = Date.now();
    const failedEngines: string[] = [];

    if (this.adapters.length === 0) {
      return { success: true, latencyMs: Date.now() - t0, failedEngines: [] };
    }

    const tasks = this.adapters.map(async (adapter) => {
      let timerId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<void>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error(`Engine ${adapter.engineId} timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      });

      try {
        await Promise.race([adapter.notifyCircuitBreaker(state), timeoutPromise]);
      } catch (err) {
        failedEngines.push(adapter.engineId);
        this.isolatedEngines.add(adapter.engineId);
        throw err;
      } finally {
        if (timerId !== undefined) {
          clearTimeout(timerId);
        }
      }
    });

    try {
      await Promise.all(tasks);

      // Perform synchronous tier-based actions
      if (state.tier === 'REDUCE') {
        await Promise.all(this.adapters.map((a) => a.reducePositions(0.5)));
      } else if (state.tier === 'HALT') {
        await Promise.all(this.adapters.map((a) => a.haltTrading()));
      } else if (state.tier === 'HARD_STOP') {
        await Promise.all(this.adapters.map((a) => a.emergencyHardStop()));
      }

      return {
        success: true,
        latencyMs: Date.now() - t0,
        failedEngines: [],
      };
    } catch (error) {
      logger.error(
        '[EngineSynchronizer] Fail-closed hard stop triggered due to adapter error or timeout',
        { error: error instanceof Error ? error.message : String(error), failedEngines }
      );

      // Fail closed: enforce emergencyHardStop on ALL adapters
      await Promise.allSettled(this.adapters.map((a) => a.emergencyHardStop()));

      return {
        success: false,
        latencyMs: Date.now() - t0,
        failedEngines,
      };
    }
  }

  public resetIsolatedEngines(): void {
    this.isolatedEngines.clear();
  }
}
