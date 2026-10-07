/**
 * Dynamic Gas Pricer Types
 *
 * Contracts for EIP-1559 base fee escalation, MEV bribe optimization,
 * and block inclusion urgency modeling.
 *
 * @module desk/execution/dynamic-gas-types
 */

export type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL_ARBITRAGE';

export interface BlockGasMetrics {
  readonly blockNumber: number;
  readonly baseFeeGwei: number;
  readonly gasUsed: number;
  readonly gasLimit: number;
}

export interface GasRecommendationRequest {
  readonly urgency: UrgencyLevel;
  readonly latestBlock: BlockGasMetrics;
  readonly expectedProfitUsd?: number;
  readonly ethPriceUsd?: number;
  readonly estimatedGasUnits?: number;
}

export interface GasFeeRecommendation {
  readonly estimatedBaseFeeGwei: number;
  readonly priorityFeeGwei: number;
  readonly maxFeePerGasGwei: number;
  readonly estimatedTotalCostUsd: number;
  readonly profitRetentionPct: number;
}
