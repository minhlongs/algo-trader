/**
 * Uniswap V3 Math Helpers
 * Price conversion from fixed-point sqrtPriceX96 and fee calculations.
 */

export const Q96 = 0x1000000000000000000000000n; // 2^96

/**
 * Convert sqrtPriceX96 to a decimal price (token1/token0).
 * Returns 0 on invalid input.
 */
export function sqrtPriceX96ToPrice(sqrtPriceX96: string, decimals0 = 18, decimals1 = 18): number {
  try {
    const sqrt = BigInt(sqrtPriceX96);
    if (sqrt <= 0n) return 0;
    const priceX96 = (sqrt * sqrt) / Q96;
    const shift = 10 ** (decimals0 - decimals1);
    return Number(priceX96) / 2 ** 96 * shift;
  } catch {
    return 0;
  }
}

/**
 * Determine the fee tier enum (basis points) from fee amount.
 */
export function feeToPercent(feeBps: number): number {
  return feeBps / 10_000;
}
