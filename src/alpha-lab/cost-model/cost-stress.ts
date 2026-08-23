/**
 * Cost Stress Model
 *
 * Configurable cost stress modes for backtests: NORMAL / CONSERVATIVE / ADVERSE.
 *
 * This module is PURE and deterministic. It does not read candles, does not
 * compute PnL, and does not depend on any runtime state. All values are
 * configuration parameters — the preset values are NOT universally correct
 * and callers may override any field via `resolveCostConfig`.
 *
 * The output of `applyStressToBaselineConfig` is the exact
 * `{ feeBps, slippageBps }` shape consumed by `baseline-runner.ts`
 * (`BaselineCostConfig`) and `trade-builder.ts` (`TradeBuilderConfig`).
 */

/** Stress-mode identifier. */
export type CostStressMode = 'NORMAL' | 'CONSERVATIVE' | 'ADVERSE';

/** Full cost-stress configuration for a single mode. */
export interface CostStressConfig {
  mode: CostStressMode;
  /** Trading fee in basis points (one side). */
  feeBps: number;
  /** Bid-ask spread in basis points. */
  spreadBps: number;
  /** Slippage in basis points (one side). */
  slippageBps: number;
  /** Optional market-impact cost in basis points. */
  marketImpactBps?: number;
  /** Human-readable label for reports and logs. */
  label: string;
}

/**
 * Sensible preset values keyed by stress mode.
 *
 * These are CONFIGURATION PARAMETERS, not hardcoded assumptions. The mission
 * doc suggests NORMAL=5bps, CONSERVATIVE=10bps, ADVERSE=20+bps but the exact
 * composition (fee + spread + slippage) is a modelling choice. Callers may
 * override any field via `resolveCostConfig`.
 */
export const DEFAULT_STRESS_PRESETS: Record<CostStressMode, CostStressConfig> = {
  NORMAL: {
    mode: 'NORMAL',
    feeBps: 5,
    spreadBps: 2,
    slippageBps: 3,
    label: 'Normal market conditions',
  },
  CONSERVATIVE: {
    mode: 'CONSERVATIVE',
    feeBps: 10,
    spreadBps: 5,
    slippageBps: 8,
    label: 'Conservative cost estimate',
  },
  ADVERSE: {
    mode: 'ADVERSE',
    feeBps: 20,
    spreadBps: 15,
    slippageBps: 20,
    label: 'Adverse market conditions',
  },
};

/**
 * Resolve a cost-stress configuration for a given mode, merging any caller
 * overrides on top of the preset. Overrides win — deep merge is shallow here
 * because every field is a primitive, but `marketImpactBps` is optional and
 * may be supplied only via overrides.
 *
 * @param mode - Stress mode to resolve.
 * @param overrides - Partial config fields that override the preset.
 * @returns A new, frozen CostStressConfig object.
 */
export function resolveCostConfig(
  mode: CostStressMode,
  overrides?: Partial<CostStressConfig>,
): CostStressConfig {
  const preset = DEFAULT_STRESS_PRESETS[mode];
  if (!preset) {
    throw new Error(`Unknown CostStressMode: ${String(mode)}`);
  }
  const resolved: CostStressConfig = {
    ...preset,
    ...(overrides ?? {}),
    mode, // force mode to match the requested key even if caller lies
  };
  return Object.freeze(resolved);
}

/**
 * Total round-trip cost in basis points.
 *
 * Fee is doubled (entry + exit). Spread and slippage are single-sided in the
 * preset but represent a full round-trip spread cost, so they are added once.
 * Market impact, if present, is added once.
 *
 * @param config - Cost-stress configuration.
 * @returns Total round-trip cost in basis points.
 */
export function totalRoundTripCostBps(config: CostStressConfig): number {
  const impact = config.marketImpactBps ?? 0;
  return config.feeBps * 2 + config.spreadBps + config.slippageBps + impact;
}

/**
 * Convert a CostStressConfig into the { feeBps, slippageBps } shape that
 * `baseline-runner.ts` and `trade-builder.ts` already consume.
 *
 * Spread and market impact are folded into `feeBps` so callers that only
 * accept two cost parameters still account for the full stress mode.
 *
 * @param baselineConfig - Unused; accepted for future extensibility. The
 *   function is pure and does not read this argument.
 * @param mode - Stress mode to apply.
 * @param overrides - Optional overrides merged onto the preset.
 * @returns An object with `feeBps` and `slippageBps` fields.
 */
export function applyStressToBaselineConfig(
  _baselineConfig: unknown,
  mode: CostStressMode,
  overrides?: Partial<CostStressConfig>,
): { feeBps: number; slippageBps: number } {
  const config = resolveCostConfig(mode, overrides);
  return {
    feeBps: config.feeBps + config.spreadBps + (config.marketImpactBps ?? 0),
    slippageBps: config.slippageBps,
  };
}

/** Return all supported stress modes in canonical order. */
export function listStressModes(): CostStressMode[] {
  return ['NORMAL', 'CONSERVATIVE', 'ADVERSE'];
}