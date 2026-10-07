/**
 * MEV Protection & JIT Liquidity Contracts
 *
 * @module desk/mev/mev-protection-types
 */

export interface PrivateBundleTransaction {
  readonly txHash: string;
  readonly signer: string;
  readonly targetContract: string;
  readonly gasLimit: number;
  readonly maxPriorityFeePerGasGwei: number;
  readonly callData: string;
}

export interface PrivateBundleRequest {
  readonly bundleId: string;
  readonly transactions: readonly PrivateBundleTransaction[];
  readonly targetBlockNumber: number;
  readonly minTimestampSec?: number;
  readonly maxTimestampSec?: number;
}

export interface BundleRelayReceipt {
  readonly bundleId: string;
  readonly isIncluded: boolean;
  readonly blockNumber: number;
  readonly minerTipGwei: number;
  readonly rejectionReason?: string;
}

export interface JitLiquidityPlan {
  readonly poolAddress: string;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidityAmount: bigint;
  readonly targetSwapHash: string;
  readonly expectedFeeCaptureUsd: number;
  readonly maxDurationBlocks: number;
}

export interface ToxicLvrInterception {
  readonly poolAddress: string;
  readonly externalVenuePrice: number;
  readonly ammPoolPrice: number;
  readonly priceDiscrepancyBps: number;
  readonly isToxicArbDetected: boolean;
  readonly suggestedInternalArbSize: number;
}
