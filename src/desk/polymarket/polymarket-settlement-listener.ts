/**
 * Polymarket Settlement Listener
 * Tracks CLOB market_resolved events and on-chain Polygon CTF payouts
 * to calculate and realize trade P&L into portfolio state.
 */

import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/logger';
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

export class PolymarketSettlementListener extends EventEmitter {
  private readonly positions = new Map<string, TrackedPosition>();
  private readonly conditionPositions = new Map<string, Set<string>>();
  private readonly resolvedConditions = new Map<string, MarketResolutionEvent>();
  private readonly portfolioHub?: PortfolioTelemetryHub;
  private readonly defaultEngineId: EngineId;

  constructor(config: SettlementListenerConfig = {}) {
    super();
    this.portfolioHub = config.portfolioHub;
    this.defaultEngineId = config.defaultEngineId ?? 'arbitrage';
  }

  public trackPosition(pos: TrackedPosition): void {
    this.positions.set(pos.positionId, pos);
    let set = this.conditionPositions.get(pos.conditionId);
    if (!set) {
      set = new Set();
      this.conditionPositions.set(pos.conditionId, set);
    }
    set.add(pos.positionId);

    const resolution = this.resolvedConditions.get(pos.conditionId);
    if (resolution) {
      this.settlePosition(pos, resolution);
    }
  }

  public untrackPosition(positionId: string): void {
    const pos = this.positions.get(positionId);
    if (pos) {
      this.conditionPositions.get(pos.conditionId)?.delete(positionId);
      this.positions.delete(positionId);
    }
  }

  public getTrackedPositions(): TrackedPosition[] {
    return Array.from(this.positions.values());
  }

  public handleMarketResolved(event: MarketResolutionEvent): RealizedSettlement[] {
    this.resolvedConditions.set(event.conditionId, event);
    this.emit('market_resolved', event);

    const positionIds = this.conditionPositions.get(event.conditionId);
    const settlements: RealizedSettlement[] = [];

    if (positionIds) {
      for (const id of Array.from(positionIds)) {
        const pos = this.positions.get(id);
        if (pos) {
          const settlement = this.settlePosition(pos, event);
          settlements.push(settlement);
        }
      }
    }
    return settlements;
  }

  public handleCtfPayout(event: CtfPayoutEvent): RealizedSettlement[] {
    this.emit('ctf_payout', event);
    const positionIds = this.conditionPositions.get(event.conditionId);
    const settlements: RealizedSettlement[] = [];

    if (positionIds) {
      for (const id of Array.from(positionIds)) {
        const pos = this.positions.get(id);
        if (pos) {
          const won = event.payoutAmount > 0;
          const costBasisUsd = pos.size * pos.entryPrice;
          const payoutUsd = won ? event.payoutAmount : 0;
          const realizedPnlUsd = payoutUsd - costBasisUsd;

          const settlement: RealizedSettlement = {
            positionId: pos.positionId,
            conditionId: pos.conditionId,
            tokenId: pos.tokenId,
            realizedPnlUsd,
            payoutUsd,
            costBasisUsd,
            won,
            timestamp: event.timestamp || Date.now(),
          };

          this.recordSettlement(settlement, pos.engineId);
          settlements.push(settlement);
          this.untrackPosition(pos.positionId);
        }
      }
    }
    return settlements;
  }

  private settlePosition(pos: TrackedPosition, res: MarketResolutionEvent): RealizedSettlement {
    const isWinner = pos.tokenId === res.winningTokenId || pos.outcomeIndex === res.winningOutcomeIndex;
    const payoutPerUnit = isWinner ? 1.0 : 0.0;
    const payoutUsd = pos.size * payoutPerUnit;
    const costBasisUsd = pos.size * pos.entryPrice;
    const realizedPnlUsd = payoutUsd - costBasisUsd;

    const settlement: RealizedSettlement = {
      positionId: pos.positionId,
      conditionId: pos.conditionId,
      tokenId: pos.tokenId,
      realizedPnlUsd,
      payoutUsd,
      costBasisUsd,
      won: isWinner,
      timestamp: res.timestamp || Date.now(),
    };

    this.recordSettlement(settlement, pos.engineId);
    this.untrackPosition(pos.positionId);
    return settlement;
  }

  private recordSettlement(settlement: RealizedSettlement, engineId?: EngineId): void {
    const targetEngine = engineId ?? this.defaultEngineId;
    if (this.portfolioHub) {
      try {
        this.portfolioHub.ingestEngineTrade(targetEngine, settlement.realizedPnlUsd, 0);
      } catch (err) {
        logger.error('[PolymarketSettlement] Failed to ingest trade into PortfolioHub', { err });
      }
    }
    this.emit('payout_realized', settlement);
  }
}
