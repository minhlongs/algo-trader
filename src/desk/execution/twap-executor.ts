/**
 * TWAP Order Executor — Barrel Facade
 *
 * Previously a monolithic 297-LOC file. Extracted into two focused submodules:
 * - twap-executor-types.ts — interfaces, config constants, callback types
 * - twap-executor-class.ts — TwapExecutor class implementation
 */

export type { TwapConfig, TwapOrder, TwapChunkResult, TwapResult, GetDepthFn, ExecuteChunkFn, GetPriceFn } from './twap-executor-types';
export { DEFAULT_TWAP_CONFIG, FLOAT_EPSILON } from './twap-executor-types';
export { TwapExecutor } from './twap-executor-class';
