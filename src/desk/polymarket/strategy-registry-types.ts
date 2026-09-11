import type { BaseStrategyConfig, BasePolymarketStrategy } from '../strategies/polymarket/base-polymarket-strategy';

export interface StrategyEntry {
  /** Display name (kebab-case key) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Constructor — strategies may accept Partial<Config> with optional extra params */
  // any[] intentionally — contravariance prevents narrower params from fitting unknown[]
  ctor: new (...args: any[]) => BasePolymarketStrategy;
  /** Default config */
  defaultConfig: BaseStrategyConfig;
}
