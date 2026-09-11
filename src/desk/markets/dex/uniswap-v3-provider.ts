/**
 * Uniswap V3 Provider Helpers
 * JSON-RPC provider instantiation and injectable interface.
 */

import { ethers } from 'ethers';
import type { DexAdapterConfig } from './dex-types';
import { DEFAULT_RPC } from './uniswap-v3-constants';

/** Minimal interface for an ethers provider — enables test injection */
export interface EthersProviderLike {
  getBlockNumber(): Promise<number>;
  call(tx: ethers.TransactionRequest): Promise<string>;
}

/** Creates a real ethers JsonRpcProvider from env or config */
export function createDefaultProvider(config?: DexAdapterConfig): ethers.JsonRpcProvider {
  const rpcUrl = config?.rpcUrl ?? process.env.ETH_RPC_URL ?? DEFAULT_RPC;
  return new ethers.JsonRpcProvider(rpcUrl, config?.chainId ?? 1, {
    staticNetwork: true,
  });
}
