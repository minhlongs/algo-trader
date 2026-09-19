import type { BaseStrategyConfig, BasePolymarketStrategy, StrategyDeps } from '../strategies/polymarket/base-polymarket-strategy';
import type { StrategyConstructor } from './strategy-runner-types';

export type { StrategyConstructor };

/**
 * Storage constructor type — accepts any strategy class whose constructor
 * takes `(deps: StrategyDeps, ...)` and returns a BasePolymarketStrategy.
 *
 * Uses `never` in contravariant parameter positions so every narrower
 * constructor signature (config?: Partial<FooConfig>, kellySizer?, clock?, ...)
 * is assignable without a cast.
 */
export type StrategyEntryConstructor = new (deps: StrategyDeps, config?: never, ...args: never[]) => BasePolymarketStrategy;

export interface StrategyEntry {
  /** Display name (kebab-case key) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Constructor — any (deps, config?, ...) => BasePolymarketStrategy */
  ctor: StrategyEntryConstructor;
  /** Default config */
  defaultConfig: BaseStrategyConfig;
}
