/**
 * Just-in-Time (JIT) Liquidity Provisioner
 * Optimizes concentrated liquidity brackets for imminent large volume swaps.
 *
 * @module desk/mev/jit-liquidity-provisioner
 */

import { JitLiquidityPlan } from './mev-protection-types';

export interface SwapOpportunity {
  readonly poolAddress: string;
  readonly swapTxHash: string;
  readonly currentTick: number;
  readonly swapVolumeUsd: number;
  readonly poolFeeTierBps: number;
  readonly targetBlockNumber: number;
}

export class JitLiquidityProvisioner {
  private readonly minProfitThresholdUsd: number;
  private readonly tickWidth: number;

  public constructor(minProfitThresholdUsd = 20.0, tickWidth = 2) {
    this.minProfitThresholdUsd = minProfitThresholdUsd;
    this.tickWidth = tickWidth;
  }

  public planJitProvision(swap: SwapOpportunity): JitLiquidityPlan | undefined {
    // Expected fee share estimate
    const grossFeePool = swap.swapVolumeUsd * (swap.poolFeeTierBps / 10_000);
    const estimatedCapturedFee = grossFeePool * 0.70; // Capturing 70% of swap fee via ultra-tight tick bracket

    if (estimatedCapturedFee < this.minProfitThresholdUsd) {
      return undefined;
    }

    const tickLower = swap.currentTick - this.tickWidth;
    const tickUpper = swap.currentTick + this.tickWidth;

    // Synthetic liquidity scaled by swap volume
    const syntheticLiquidity = BigInt(Math.floor(swap.swapVolumeUsd * 1000));

    return {
      poolAddress: swap.poolAddress,
      tickLower,
      tickUpper,
      liquidityAmount: syntheticLiquidity,
      targetSwapHash: swap.swapTxHash,
      expectedFeeCaptureUsd: Number(estimatedCapturedFee.toFixed(2)),
      maxDurationBlocks: 1, // Must be burned in the very next block
    };
  }
}
