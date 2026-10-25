/**
 * Engine Strategy Runner — Coordinates lifecycle of registered strategy instances.
 *
 * Bridges the legacy engine-level StrategyRunner contract used by TradingPipeline
 * with V2 desk strategy instances (`src/desk/polymarket/strategy-runner.ts` is also
 * re-exported as `DeskStrategyRunner` for single-strategy V2 live execution).
 */
import { logger } from '../desk/core/logger';
import type { StrategyConfig } from '../desk/core/types';
import { StrategyRunner as DeskStrategyRunner } from '../desk/polymarket/strategy-runner';

export { DeskStrategyRunner };

export interface ManagedStrategy {
  start?(): Promise<void> | void;
  stop(): Promise<void> | void;
}

export type ManagedStrategyStatus = 'registered' | 'running' | 'stopped' | 'error';

export class StrategyRunner {
  /** Kept public-compatible via Map for TradingPipeline getMarketMakerInstanceFor lookup */
  private strategies = new Map<string, ManagedStrategy>();
  private statuses = new Map<string, ManagedStrategyStatus>();

  register(name: string, strategy: ManagedStrategy): void {
    this.strategies.set(name, strategy);
    this.statuses.set(name, 'registered');
    logger.debug(`StrategyRunner: registered ${name}`, 'StrategyRunner');
  }

  getStrategy<T extends ManagedStrategy = ManagedStrategy>(name: string): T | undefined {
    return this.strategies.get(name) as T | undefined;
  }

  async startAll(configs: StrategyConfig[] = []): Promise<void> {
    const enabledSet = new Set<string>(
      configs.filter((c) => c.enabled !== false).map((c) => c.name),
    );
    for (const [name, strat] of this.strategies) {
      if (configs.length > 0 && !enabledSet.has(name)) {
        continue;
      }
      try {
        if (typeof strat.start === 'function') {
          await strat.start();
        }
        this.statuses.set(name, 'running');
      } catch (err) {
        this.statuses.set(name, 'error');
        logger.error(`StrategyRunner: failed to start ${name}`, 'StrategyRunner', { err: String(err) });
        throw err;
      }
    }
    logger.info(`StrategyRunner: startAll active=${this.strategies.size} configs=${configs.length}`, 'StrategyRunner');
  }

  async stopAll(): Promise<void> {
    const errors: Error[] = [];
    for (const [name, strat] of this.strategies) {
      try {
        await strat.stop();
        this.statuses.set(name, 'stopped');
      } catch (err) {
        this.statuses.set(name, 'error');
        errors.push(new Error(`${name}: ${String(err)}`));
      }
    }
    if (errors.length > 0) {
      logger.warn(`StrategyRunner: ${errors.length} errors during stopAll`, 'StrategyRunner');
    }
  }

  getAllStatus(): Array<{ name: string; status: ManagedStrategyStatus }> {
    return Array.from(this.strategies.keys()).map((name) => ({
      name,
      status: this.statuses.get(name) ?? 'registered',
    }));
  }
}
