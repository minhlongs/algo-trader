/**
 * Strategies Loader - Stub for type checking
 * Real implementation would load trading strategies from disk/database
 */

export interface StrategyInfo {
  id: string;
  name: string;
  version: string;
  parameters: Record<string, unknown>;
}

export class StrategyLoader {
  private static instance: StrategyLoader;
  private strategies: Map<string, StrategyInfo> = new Map();

  private constructor() {}

  static getInstance(): StrategyLoader {
    if (!StrategyLoader.instance) {
      StrategyLoader.instance = new StrategyLoader();
    }
    return StrategyLoader.instance;
  }

  async loadStrategy(id: string): Promise<StrategyInfo | null> {
    return this.strategies.get(id) || null;
  }

  async listStrategies(): Promise<StrategyInfo[]> {
    return Array.from(this.strategies.values());
  }

  async registerStrategy(info: StrategyInfo): Promise<void> {
    this.strategies.set(info.id, info);
  }

  async unloadStrategy(id: string): Promise<boolean> {
    return this.strategies.delete(id);
  }
}

export const strategyLoader = StrategyLoader.getInstance();

export function getStrategyLoader(): StrategyLoader {
  return StrategyLoader.getInstance();
}
