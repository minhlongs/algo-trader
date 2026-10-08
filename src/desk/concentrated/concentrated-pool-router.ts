/**
 * Concentrated Pool Router
 * Multi-tick swap execution routing across initialized tick boundaries with liquidity transition.
 *
 * @module desk/concentrated/concentrated-pool-router
 */

import {
  Tick,
  ConcentratedPoolState,
  ConcentratedSwapResult,
} from './concentrated-types';
import { TickMathQ64Engine } from './tick-math-q64-engine';

export class ConcentratedPoolRouter {
  private readonly ticks = new Map<number, Tick>();
  private poolState: ConcentratedPoolState;

  constructor(initialState: ConcentratedPoolState) {
    this.poolState = { ...initialState };
  }

  public initializeTick(index: number, liquidityGross: bigint, liquidityNet: bigint): void {
    const sqrtPriceX96 = TickMathQ64Engine.getSqrtRatioAtTick(index);
    this.ticks.set(index, {
      index,
      liquidityGross,
      liquidityNet,
      sqrtPriceX96,
      initialized: true,
    });
  }

  public getPoolState(): ConcentratedPoolState {
    return { ...this.poolState };
  }

  public executeSwap(amountSpecified: bigint, zeroForOne: boolean): ConcentratedSwapResult {
    if (amountSpecified <= 0n) {
      throw new Error('amountSpecified must be strictly positive');
    }

    let amountRemaining = amountSpecified;
    let amountInTotal = 0n;
    let amountOutTotal = 0n;
    let totalFeeAmount = 0n;
    let ticksCrossed = 0;

    let currentSqrtPriceX96 = this.poolState.sqrtPriceX96;
    let currentTick = this.poolState.currentTick;
    let currentLiquidity = this.poolState.liquidity;

    while (amountRemaining > 0n && currentLiquidity > 0n) {
      const nextTickIndex = this.findNextInitializedTick(currentTick, zeroForOne);
      const targetSqrtPriceX96 = nextTickIndex !== null
        ? TickMathQ64Engine.getSqrtRatioAtTick(nextTickIndex)
        : zeroForOne
          ? TickMathQ64Engine.getSqrtRatioAtTick(TickMathQ64Engine.MIN_TICK)
          : TickMathQ64Engine.getSqrtRatioAtTick(TickMathQ64Engine.MAX_TICK);

      const step = TickMathQ64Engine.computeSwapStep(
        currentSqrtPriceX96,
        targetSqrtPriceX96,
        currentLiquidity,
        amountRemaining,
        this.poolState.feeBps,
        zeroForOne
      );

      amountInTotal += step.amountIn;
      amountOutTotal += step.amountOut;
      totalFeeAmount += step.feeAmount;
      amountRemaining -= (step.amountIn + step.feeAmount);
      currentSqrtPriceX96 = step.sqrtPriceNextX96;

      if (currentSqrtPriceX96 === targetSqrtPriceX96 && nextTickIndex !== null) {
        const crossedTick = this.ticks.get(nextTickIndex);
        if (crossedTick) {
          // When crossing left-to-right (price rising, token0 for token1 false), add liquidityNet
          // When crossing right-to-left (price dropping, zeroForOne true), subtract liquidityNet
          if (zeroForOne) {
            currentLiquidity -= crossedTick.liquidityNet;
          } else {
            currentLiquidity += crossedTick.liquidityNet;
          }
          if (currentLiquidity < 0n) {
            throw new Error(`Liquidity underflow on crossing tick ${nextTickIndex}: negative liquidity is forbidden`);
          }
          ticksCrossed += 1;
          currentTick = zeroForOne ? nextTickIndex - 1 : nextTickIndex;
        } else {
          break;
        }
      } else {
        currentTick = TickMathQ64Engine.getTickAtSqrtRatio(currentSqrtPriceX96);
        break;
      }
    }

    this.poolState.sqrtPriceX96 = currentSqrtPriceX96;
    this.poolState.currentTick = currentTick;
    this.poolState.liquidity = currentLiquidity;

    return {
      amountIn: amountInTotal,
      amountOut: amountOutTotal,
      finalSqrtPriceX96: currentSqrtPriceX96,
      finalTick: currentTick,
      finalLiquidity: currentLiquidity,
      totalFeeAmount,
      ticksCrossed,
    };
  }

  private findNextInitializedTick(currentTick: number, zeroForOne: boolean): number | null {
    const initializedTicks = Array.from(this.ticks.keys()).sort((a, b) => a - b);
    if (zeroForOne) {
      for (let i = initializedTicks.length - 1; i >= 0; i--) {
        const tick = initializedTicks[i];
        if (tick !== undefined && tick <= currentTick) {
          return tick;
        }
      }
    } else {
      for (let i = 0; i < initializedTicks.length; i++) {
        const tick = initializedTicks[i];
        if (tick !== undefined && tick > currentTick) {
          return tick;
        }
      }
    }
    return null;
  }
}
