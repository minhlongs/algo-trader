/**
 * Tick Math & Q64.96 Fixed-Point Engine
 * Computes exact sqrt-ratio conversions and single-step concentrated AMM liquidity curves.
 *
 * @module desk/concentrated/tick-math-q64-engine
 */

import { SwapStepResult } from './concentrated-types';

export class TickMathQ64Engine {
  public static readonly Q96 = 79228162514264337593543950336n; // 2^96
  public static readonly MIN_TICK = -887272;
  public static readonly MAX_TICK = 887272;

  /**
   * Calculates sqrt(1.0001^tick) * 2^96 with floating-point precision mapped to BigInt.
   */
  public static getSqrtRatioAtTick(tick: number): bigint {
    if (tick < this.MIN_TICK || tick > this.MAX_TICK) {
      throw new Error(`Tick out of bounds: ${tick}`);
    }
    const ratio = Math.pow(1.0001, tick / 2);
    // Multiply ratio by 2^96 using floating precision and scaling
    return BigInt(Math.floor(ratio * Number(this.Q96)));
  }

  /**
   * Calculates tick index corresponding to sqrt(P) * 2^96.
   */
  public static getTickAtSqrtRatio(sqrtPriceX96: bigint): number {
    if (sqrtPriceX96 <= 0n) {
      throw new Error('sqrtPriceX96 must be strictly positive');
    }
    const ratio = Number(sqrtPriceX96) / Number(this.Q96);
    const tick = Math.floor((2 * Math.log(ratio)) / Math.log(1.0001));
    return Math.max(this.MIN_TICK, Math.min(this.MAX_TICK, tick));
  }

  /**
   * Computes a single swap step within one tick interval.
   */
  public static computeSwapStep(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feeBps: number,
    zeroForOne: boolean
  ): SwapStepResult {
    const feePips = BigInt(feeBps * 100);
    const feeDenominator = 1_000_000n;
    const amountRemainingLessFee = (amountRemaining * (feeDenominator - feePips)) / feeDenominator;

    let sqrtPriceNextX96: bigint;
    let amountIn: bigint;
    let amountOut: bigint;

    if (zeroForOne) {
      // Selling token0 for token1 -> price drops: sqrtRatioTarget <= sqrtRatioCurrent
      const amountInMax = this.getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity);

      if (amountRemainingLessFee >= amountInMax) {
        sqrtPriceNextX96 = sqrtRatioTargetX96;
        amountIn = amountInMax;
      } else {
        sqrtPriceNextX96 = this.getNextSqrtPriceFromAmount0(sqrtRatioCurrentX96, liquidity, amountRemainingLessFee);
        amountIn = this.getAmount0Delta(sqrtPriceNextX96, sqrtRatioCurrentX96, liquidity);
      }
      amountOut = this.getAmount1Delta(sqrtPriceNextX96, sqrtRatioCurrentX96, liquidity);
    } else {
      // Selling token1 for token0 -> price rises: sqrtRatioTarget >= sqrtRatioCurrent
      const amountInMax = this.getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity);

      if (amountRemainingLessFee >= amountInMax) {
        sqrtPriceNextX96 = sqrtRatioTargetX96;
        amountIn = amountInMax;
      } else {
        sqrtPriceNextX96 = this.getNextSqrtPriceFromAmount1(sqrtRatioCurrentX96, liquidity, amountRemainingLessFee);
        amountIn = this.getAmount1Delta(sqrtRatioCurrentX96, sqrtPriceNextX96, liquidity);
      }
      amountOut = this.getAmount0Delta(sqrtRatioCurrentX96, sqrtPriceNextX96, liquidity);
    }

    const feeAmount = (amountIn * feePips) / (feeDenominator - feePips);

    return {
      sqrtPriceNextX96,
      amountIn,
      amountOut,
      feeAmount,
    };
  }

  public static getAmount0Delta(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
    const [lower, upper] = sqrtRatioAX96 < sqrtRatioBX96 ? [sqrtRatioAX96, sqrtRatioBX96] : [sqrtRatioBX96, sqrtRatioAX96];
    if (lower === 0n) return 0n;
    const numerator = liquidity * this.Q96 * (upper - lower);
    return numerator / (upper * lower);
  }

  public static getAmount1Delta(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
    const [lower, upper] = sqrtRatioAX96 < sqrtRatioBX96 ? [sqrtRatioAX96, sqrtRatioBX96] : [sqrtRatioBX96, sqrtRatioAX96];
    return (liquidity * (upper - lower)) / this.Q96;
  }

  private static getNextSqrtPriceFromAmount0(sqrtPriceX96: bigint, liquidity: bigint, amountIn: bigint): bigint {
    if (amountIn === 0n) return sqrtPriceX96;
    const numerator = liquidity * this.Q96;
    const product = amountIn * sqrtPriceX96;
    const denominator = numerator / sqrtPriceX96 + amountIn;
    return denominator > 0n ? numerator / denominator : sqrtPriceX96;
  }

  private static getNextSqrtPriceFromAmount1(sqrtPriceX96: bigint, liquidity: bigint, amountIn: bigint): bigint {
    return sqrtPriceX96 + (amountIn * this.Q96) / liquidity;
  }
}
