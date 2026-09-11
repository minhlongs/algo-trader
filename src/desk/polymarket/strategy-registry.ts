/**
 * Strategy Registry — facade
 *
 * Maps strategy names (kebab-case) to constructors + default configs.
 * Used by CLI `algo trade run --strategy=<name>` and the StrategyRunner.
 *
 * Submodules:
 * - strategy-registry-types.ts: StrategyEntry interface
 * - strategy-registry-entries-a-m.ts: Strategies A through M + listing-arbitrage-sniper
 * - strategy-registry-entries-n-z.ts: Strategies N through Z
 */

export type { StrategyEntry } from './strategy-registry-types';
import type { StrategyEntry } from './strategy-registry-types';
import { REGISTRY_A_M } from './strategy-registry-entries-a-m';
import { REGISTRY_N_Z } from './strategy-registry-entries-n-z';

const REGISTRY: Record<string, StrategyEntry> = {
  ...REGISTRY_A_M,
  ...REGISTRY_N_Z,
};

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
