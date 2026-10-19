// SPDX-License-Identifier: MIT
/**
 * Stitch Screen #14: Multi-Regime Fractional Kelly, SVI Surface & VPIN Toxicity Telemetry
 * Powers `site/public/regime-kelly-matrix.html` with Thorp (2006) Fractional Kelly,
 * Gatheral (2006) SVI butterfly no-arbitrage, and Easley-López de Prado (2012) VPIN CDF.
 */

export type MarketRegimeState =
  | 'BULL_QUIET'
  | 'NORMAL_LIQUID'
  | 'VOL_EXPANSION'
  | 'TOXIC_FLASH_CRASH';

export interface RegimeKellyAllocationRow {
  readonly regime: MarketRegimeState;
  readonly fullKellyFraction: number;
  readonly fractionalMultiplier: number;
  readonly effectiveLeverageFraction: number;
  readonly maxDrawdownCapPct: number;
}

export interface RegimeKellyCockpitSnapshot {
  readonly screenId: 'regime-kelly-matrix';
  readonly screenNumber: 14;
  readonly activeRegime: MarketRegimeState;
  readonly portfolioEquityUsd: number;
  readonly sviDurrlemanGValue: number;
  readonly sviButterflyArbitrageFree: boolean;
  readonly diurnalSeasonalityFactor: number;
  readonly vpinCdfScore: number;
  readonly allocations: readonly RegimeKellyAllocationRow[];
}

export const DEFAULT_REGIME_KELLY_ROWS: readonly RegimeKellyAllocationRow[] = [
  { regime: 'BULL_QUIET', fullKellyFraction: 0.42, fractionalMultiplier: 0.5, effectiveLeverageFraction: 0.21, maxDrawdownCapPct: -4.5 },
  { regime: 'NORMAL_LIQUID', fullKellyFraction: 0.36, fractionalMultiplier: 0.35, effectiveLeverageFraction: 0.126, maxDrawdownCapPct: -3.0 },
  { regime: 'VOL_EXPANSION', fullKellyFraction: 0.24, fractionalMultiplier: 0.2, effectiveLeverageFraction: 0.048, maxDrawdownCapPct: -1.5 },
  { regime: 'TOXIC_FLASH_CRASH', fullKellyFraction: 0.0, fractionalMultiplier: 0.0, effectiveLeverageFraction: 0.0, maxDrawdownCapPct: 0.0 },
];

export function buildRegimeKellyCockpitSnapshot(
  activeRegime: MarketRegimeState = 'NORMAL_LIQUID',
  portfolioEquityUsd = 1248500,
): RegimeKellyCockpitSnapshot {
  return {
    screenId: 'regime-kelly-matrix',
    screenNumber: 14,
    activeRegime,
    portfolioEquityUsd,
    sviDurrlemanGValue: 0.842,
    sviButterflyArbitrageFree: true,
    diurnalSeasonalityFactor: 1.18,
    vpinCdfScore: activeRegime === 'TOXIC_FLASH_CRASH' ? 0.975 : 0.284,
    allocations: DEFAULT_REGIME_KELLY_ROWS,
  };
}
