/**
 * Strategy Registry — facade
 *
 * Maps strategy names (kebab-case) to constructors + default configs.
 * Used by CLI `algo trade run --strategy=<name>` and the StrategyRunner.
 *
 * Previously a monolithic 303-LOC file. Extracted into two focused submodules:
 * - strategy-registry-full-entries-a-n.ts (20 strategies, spread-mean-reversion → recency-bias)
 * - strategy-registry-full-entries-o-z.ts (15 strategies, regime-adaptive → cycle-end-sniper)
 *
 * Adding a new strategy:
 * 1. Import the class + config in the appropriate entries submodule
 * 2. Add an entry to either REGISTRY_A_N or REGISTRY_O_Z
 */

export type { StrategyEntry } from './strategy-registry-full-entries-a-n';
import { REGISTRY_A_N } from './strategy-registry-full-entries-a-n';
import { REGISTRY_O_Z } from './strategy-registry-full-entries-o-z';
import type { StrategyEntry } from './strategy-registry-full-entries-a-n';

const REGISTRY: Record<string, StrategyEntry> = { ...REGISTRY_A_N, ...REGISTRY_O_Z };

/** List all registered strategies (name + description only, lightweight) */
export function listStrategies(): Array<{ name: string; description: string }> {
  return Object.values(REGISTRY).map(({ name, description }) => ({ name, description }));
}

/** Look up a strategy by name. Returns undefined if not found. */
export function getStrategy(name: string): StrategyEntry | undefined {
  return REGISTRY[name];
}

/** Get count of registered strategies */
export function getStrategyCount(): number {
  return Object.keys(REGISTRY).length;
}
