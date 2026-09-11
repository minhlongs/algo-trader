/**
 * Uniswap V3 DEX Adapter — Constants & ABIs
 * Contract addresses, fee tiers, and minimal JSON-RPC interface definitions.
 */

/** Uniswap V3 Factory (Ethereum mainnet) */
export const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

/** Uniswap V3 Quoter (Ethereum mainnet) */
export const UNISWAP_V3_QUOTER = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

/** Fee tiers in basis points */
export const FEE_TIERS = [100, 500, 3000, 10000] as const;

export const RATE_PER_SEC = 10; // Conservative for public RPC

export const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
  'function feeAmountTickSpacing(uint24 fee) view returns (int24 spacing)',
];

export const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
];

export const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

export const DEFAULT_RPC = 'https://eth.llamarpc.com';
