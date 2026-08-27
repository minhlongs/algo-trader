/**
 * Negative Risk Scanner — Facade.
 *
 * Re-exports all public API from split modules. The tick factory orchestrates
 * entry scanning and exit evaluation via the runtime context.
 */

// ── Re-exports (facade) ──────────────────────────────────────────────────────
export {
  NegativeRiskScannerConfig,
  DEFAULT_CONFIG,
  NegativeRiskScannerDeps,
  ArbPosition,
  STRATEGY_NAME,
  ScannerRuntime,
  isOnCooldown,
  setCooldown,
} from './negative-risk-types';

export { getBestAsk, getBestBid, usdcToTokens, calcExitValue } from './order-book-utils';

export { evaluateExits } from './negative-risk-exit';

export { scanEntries } from './negative-risk-entry';

// ── Internal imports for tick factory ────────────────────────────────────────
import { logger } from '../../core/logger';
import { STRATEGY_NAME, DEFAULT_CONFIG } from './negative-risk-types';
import type { NegativeRiskScannerConfig, NegativeRiskScannerDeps } from './negative-risk-types';
import { evaluateExits } from './negative-risk-exit';
import { scanEntries } from './negative-risk-entry';

/**
 * Create the per-tick async function that evaluates exits then scans entries.
 * All state lives in the closure; no class instance needed.
 */
export function createNegativeRiskScannerTick(
  config: NegativeRiskScannerConfig,
  deps: NegativeRiskScannerDeps
): () => Promise<void> {
  const { clob, orderManager, eventBus, gamma } = deps;
  const cfg: NegativeRiskScannerConfig = { ...DEFAULT_CONFIG, ...config };

  // Per-tick shared runtime context
  const runtime = {
    positions: new Map<string, { conditionId: string; yesTokenId: string; noTokenId: string; yesEntryPrice: number; noEntryPrice: number; yesSizeUsdc: number; noSizeUsdc: number; yesOrderId: string; noOrderId: string; openedAt: number }>(),
    cooldowns: new Map<string, number>(),
    cfg,
    clob,
    orderManager,
    eventBus,
    gamma,
  };

  // -- Main tick ---------------------------------------------------------------

  return async function negativeRiskScannerTick(): Promise<void> {
    try {
      await evaluateExits(runtime);
      await scanEntries(runtime);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: runtime.positions.size,
        cooldownCount: runtime.cooldowns.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}