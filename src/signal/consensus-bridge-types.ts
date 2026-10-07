/**
 * Consensus Bridge Types
 *
 * Types for bridging real-time consensus swarm proposals to pre-trade
 * LiveExecutionGuard evaluation and portfolio capital reservation.
 */

import type { PolymarketOrder } from '../desk/execution/polymarket-signer';

export interface BridgeSignalProposal {
  signalId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  confidence: number;
  source: string;
  timestamp: number;
  tokenId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GuardValidationResult {
  approved: boolean;
  signalId: string;
  order?: PolymarketOrder;
  reservedCapitalUsd: number;
  currentExposureUsd: number;
  maxAllowedExposureUsd: number;
  rejectionReason?: string;
  timestamp: number;
}

export interface ConsensusBridgeConfig {
  capitalUsd: number;
  minConfidence: number;
  maxDrawdownThreshold: number;
  maxExposureFraction: number;
  defaultFeeRateBps?: number;
  defaultExpirationSec?: number;
}

export interface BridgeExposureSummary {
  capitalUsd: number;
  totalReservedUsd: number;
  maxAllowedExposureUsd: number;
  utilizationPct: number;
  activeReservationsCount: number;
}
