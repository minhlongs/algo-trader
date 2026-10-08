/**
 * Cross-Chain Interoperability & Settlement Types
 *
 * @module desk/interop/interop-types
 */

export type SupportedChain = 'ethereum' | 'arbitrum' | 'optimism' | 'base' | 'solana' | 'polygon';

export interface BridgeRouteRequest {
  readonly transferId: string;
  readonly sourceChain: SupportedChain;
  readonly targetChain: SupportedChain;
  readonly asset: string;
  readonly amount: bigint;
  readonly maxSlippageBps: number;
}

export interface BridgeFeeEstimate {
  readonly routeId: string;
  readonly baseL1FeeUsd: number;
  readonly variableRelayerFeeUsd: number;
  readonly destinationGasOverheadUsd: number;
  readonly totalFeeUsd: number;
  readonly estimatedFinalitySeconds: number;
}

export interface AtomicBridgeReceipt {
  readonly transferId: string;
  readonly routeId: string;
  readonly sourceTxHash: string;
  readonly destinationTxHash?: string;
  readonly status: 'PENDING' | 'SETTLED' | 'REFUNDED' | 'FAILED';
  readonly settledAmount: bigint;
  readonly executionTimeSeconds: number;
}

export interface ChainLiquidityBalance {
  readonly chain: SupportedChain;
  readonly asset: string;
  readonly balance: bigint;
  readonly targetBalance: bigint;
  readonly minThreshold: bigint;
}

export interface RebalanceAction {
  readonly sourceChain: SupportedChain;
  readonly targetChain: SupportedChain;
  readonly asset: string;
  readonly rebalanceAmount: bigint;
  readonly urgency: 'LOW' | 'MEDIUM' | 'HIGH';
}
