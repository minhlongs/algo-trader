/**
 * Profitability Gas Calculator
 * Models on-chain Polygon gas costs for prediction market settlements.
 */

import type { GasConfig, VenueTradeLeg } from './profitability-types';

export function calculateLegGas(
  leg: VenueTradeLeg,
  gasConfig: GasConfig,
  gasOverrideUsd?: number
): number {
  if (gasOverrideUsd !== undefined) {
    return gasOverrideUsd;
  }

  const venue = leg.venue.toLowerCase();
  if (venue === 'polymarket' && leg.settlementType === 'on_chain_settle') {
    // Polygon PoS formula: gasUnits * gasPriceGwei * 1e-9 * maticPriceUsd
    const formulaGas =
      gasConfig.polygonGasUnits *
      gasConfig.polygonGasPriceGwei *
      1e-9 *
      gasConfig.maticPriceUsd;
    return Math.max(formulaGas, 0);
  }

  // CEX matching and Polymarket off-chain CLOB have $0 on-chain gas
  return 0.0;
}
