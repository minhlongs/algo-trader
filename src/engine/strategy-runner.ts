/**
 * Legacy Strategy Runner — V2 migration compatibility stub.
 *
 * Manages lifecycle of registered strategy instances.
 * NOTE: This is a placeholder for the old engine-level StrategyRunner.
 * The V2 StrategyRunner lives at desk/polymarket/strategy-runner.ts.
 */
import { logger } from '../desk/core/logger';
import type { StrategyConfig } from '../desk/core/types';

export class StrategyRunner {
  private strategies = new Map<string, { stop(): Promise<void> }>();

  register(name: string, strategy: { stop(): Promise<void> }): void {
    this.strategies.set(name, strategy);
    logger.debug(`StrategyRunner: registered ${name}`, 'StrategyRunner');
  }

  async startAll(configs: StrategyConfig[]): Promise<void> {
    logger.info(`StrategyRunner: startAll called with ${configs.length} configs`, 'StrategyRunner');
  }

  async stopAll(): Promise<void> {
    const errors: Error[] = [];
    for (const [name, strat] of this.strategies) {
      try {
        await strat.stop();
      } catch (err) {
        errors.push(new Error(`${name}: ${String(err)}`));
      }
    }
    if (errors.length > 0) {
      logger.warn(`StrategyRunner: ${errors.length} errors during stopAll`, 'StrategyRunner');
    }
  }

  getAllStatus(): Array<{ name: string; status: string }> {
    return Array.from(this.strategies.keys()).map(name => ({ name, status: 'registered' }));
  }
}
