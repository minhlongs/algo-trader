/**
 * DEX adapter barrel — re-export all public types and clients.
 */

export * from './dex-types';
export {
  UniswapV3Adapter,
  sqrtPriceX96ToPrice,
  feeToPercent,
  createDefaultProvider,
  type EthersProviderLike,
} from './uniswap-v3-adapter';
