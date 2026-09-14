/**
 * Resolution Frontrunner V2 — Facade module.
 * Re-exports types, math helpers, strategy implementation, and legacy factory.
 */

import {
  ResolutionFrontrunnerStrategy,
} from './resolution-frontrunner-strategy';
import type {
  ResolutionFrontrunnerDeps,
} from './resolution-frontrunner-types';

export * from './resolution-frontrunner-types';
export * from './resolution-frontrunner-math';
export * from './resolution-frontrunner-strategy';

export function createResolutionFrontrunnerTick(
  deps: ResolutionFrontrunnerDeps,
): () => Promise<void> {
  const { config, clock, ...baseDeps } = deps;
  const strategy = new ResolutionFrontrunnerStrategy(baseDeps, config, clock);
  return strategy.toTickFn();
}
