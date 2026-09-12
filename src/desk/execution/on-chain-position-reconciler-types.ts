/**
 * On-Chain Position Reconciler Types and Constants
 */

import type { RedisClientType } from '../../redis';

/** Polymarket CTF contract address on Polygon */
export const CTF_CONTRACT_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

export const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
];

export const CRITICAL_THRESHOLD_UNITS = 5_000_000; // $5 in 6-decimal USDC units

export interface LocalTrackedPosition {
  marketId: string;
  tokenId: string;
  balance: number;
}

export interface PositionDiscrepancy {
  marketId: string;
  tokenId: string;
  localBalance: number;
  onChainBalance: number;
  difference: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export interface ReconciliationResult {
  checkedAt: number;
  positionsChecked: number;
  discrepancies: PositionDiscrepancy[];
}

export interface ReconcilerOptions {
  rpcUrl?: string;
  walletAddress: string;
  redis?: RedisClientType;
  autoCorrect?: boolean;
}
