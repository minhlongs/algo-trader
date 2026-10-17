/**
 * Polymarket Settlement Listener Types & Pure Settlement Calculators
 */

import type { PortfolioTelemetryHub } from '../telemetry/portfolio-telemetry-hub';
import type { EngineId } from '../portfolio/types';

export interface MarketResolutionEvent {
  conditionId: string;
  questionId?: string;
  winningOutcomeIndex: number;
  winningTokenId: string;
  payoutNumerators: number[];
  payoutDenominator: number;
  timestamp: number;
}

export interface CtfPayoutEvent {
  conditionId: string;
  stakeholder: string;
  collateralToken: string;
  parentCollectionId: string;
  indexSets: string[];
  payoutAmount: number;
  transactionHash?: string;
  timestamp: number;
}

export interface TrackedPosition {
  positionId: string;
  conditionId: string;
  tokenId: string;
  outcomeIndex: number;
  entryPrice: number;
  size: number;
  engineId?: EngineId;
}

export interface RealizedSettlement {
  positionId: string;
  conditionId: string;
  tokenId: string;
  realizedPnlUsd: number;
  payoutUsd: number;
  costBasisUsd: number;
  won: boolean;
  timestamp: number;
}

export interface SettlementListenerConfig {
  portfolioHub?: PortfolioTelemetryHub;
  defaultEngineId?: EngineId;
}

export function buildMarketResolutionSettlement(
  pos: TrackedPosition,
  res: MarketResolutionEvent,
): RealizedSettlement {
  const isWinner = pos.tokenId === res.winningTokenId || pos.outcomeIndex === res.winningOutcomeIndex;
  const payoutPerUnit = isWinner ? 1.0 : 0.0;
  const payoutUsd = pos.size * payoutPerUnit;
  const costBasisUsd = pos.size * pos.entryPrice;
  const realizedPnlUsd = payoutUsd - costBasisUsd;

  return {
    positionId: pos.positionId,
    conditionId: pos.conditionId,
    tokenId: pos.tokenId,
    realizedPnlUsd,
    payoutUsd,
    costBasisUsd,
    won: isWinner,
    timestamp: res.timestamp || Date.now(),
  };
}

export function buildCtfPayoutSettlement(
  pos: TrackedPosition,
  event: CtfPayoutEvent,
): RealizedSettlement {
  const won = event.payoutAmount > 0;
  const costBasisUsd = pos.size * pos.entryPrice;
  const payoutUsd = won ? event.payoutAmount : 0;
  const realizedPnlUsd = payoutUsd - costBasisUsd;

  return {
    positionId: pos.positionId,
    conditionId: pos.conditionId,
    tokenId: pos.tokenId,
    realizedPnlUsd,
    payoutUsd,
    costBasisUsd,
    won,
    timestamp: event.timestamp || Date.now(),
  };
}
