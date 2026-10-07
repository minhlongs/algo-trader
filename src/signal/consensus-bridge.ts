/**
 * Real-Time Signal Stream Consensus & Execution Guard Bridge
 *
 * Bridges consensus signals to LiveExecutionGuard pre-trade evaluation,
 * enforcing aggregate portfolio exposure caps and capital reservations.
 */

import { logger } from '../shared/utils/logger';
import { LiveExecutionGuard } from '../desk/execution/live-execution-guard-core';
import type { PolymarketOrder } from '../desk/execution/polymarket-signer';
import type {
  BridgeSignalProposal,
  GuardValidationResult,
  ConsensusBridgeConfig,
  BridgeExposureSummary,
} from './consensus-bridge-types';

export class ConsensusBridge {
  private readonly guard: LiveExecutionGuard;
  private readonly config: Required<ConsensusBridgeConfig>;
  private readonly reservations: Map<string, number> = new Map();
  private currentDrawdown = 0.0;

  constructor(guard: LiveExecutionGuard, config: ConsensusBridgeConfig) {
    this.guard = guard;
    this.config = {
      capitalUsd: config.capitalUsd,
      minConfidence: config.minConfidence,
      maxDrawdownThreshold: config.maxDrawdownThreshold,
      maxExposureFraction: config.maxExposureFraction,
      defaultFeeRateBps: config.defaultFeeRateBps ?? 0,
      defaultExpirationSec: config.defaultExpirationSec ?? 300,
    };
  }

  public validateAndReserve(proposal: BridgeSignalProposal): GuardValidationResult {
    const timestamp = Date.now();
    const maxAllowedExposureUsd = this.config.capitalUsd * this.config.maxExposureFraction;
    const currentExposureUsd = this.getTotalReservedCapital();
    const orderCostUsd = proposal.price * proposal.size;

    if (proposal.price <= 0 || proposal.size <= 0) {
      return this.rejectResult(proposal.signalId, 'Invalid price or size (must be positive)', orderCostUsd, currentExposureUsd, maxAllowedExposureUsd, timestamp);
    }

    if (proposal.confidence < this.config.minConfidence) {
      return this.rejectResult(proposal.signalId, `Confidence ${proposal.confidence} below threshold ${this.config.minConfidence}`, orderCostUsd, currentExposureUsd, maxAllowedExposureUsd, timestamp);
    }

    if (this.currentDrawdown > this.config.maxDrawdownThreshold) {
      return this.rejectResult(proposal.signalId, `Drawdown ${this.currentDrawdown} exceeds threshold ${this.config.maxDrawdownThreshold}`, orderCostUsd, currentExposureUsd, maxAllowedExposureUsd, timestamp);
    }

    if (currentExposureUsd + orderCostUsd > maxAllowedExposureUsd) {
      return this.rejectResult(proposal.signalId, `Aggregate portfolio exposure cap exceeded (${currentExposureUsd + orderCostUsd} > ${maxAllowedExposureUsd})`, orderCostUsd, currentExposureUsd, maxAllowedExposureUsd, timestamp);
    }

    const order: PolymarketOrder = {
      tokenId: proposal.tokenId ?? `tok-${proposal.symbol.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      price: proposal.price,
      size: proposal.size,
      side: proposal.side,
      expiration: Math.floor(timestamp / 1000) + this.config.defaultExpirationSec,
      nonce: `${timestamp}-${Math.floor(Math.random() * 10000)}`,
      feeRateBps: this.config.defaultFeeRateBps,
      signatureType: 0,
    };

    const guardResult = this.guard.guardOrder(order);
    if (!guardResult.approved) {
      return this.rejectResult(proposal.signalId, guardResult.reason ?? 'LiveExecutionGuard rejected order', orderCostUsd, currentExposureUsd, maxAllowedExposureUsd, timestamp);
    }

    this.reservations.set(proposal.signalId, orderCostUsd);
    logger.info('Capital reserved for consensus signal', {
      signalId: proposal.signalId,
      symbol: proposal.symbol,
      costUsd: orderCostUsd,
    });

    return {
      approved: true,
      signalId: proposal.signalId,
      order,
      reservedCapitalUsd: orderCostUsd,
      currentExposureUsd: currentExposureUsd + orderCostUsd,
      maxAllowedExposureUsd,
      timestamp,
    };
  }

  public releaseReservation(signalId: string): boolean {
    const released = this.reservations.delete(signalId);
    if (released) {
      logger.info('Capital reservation released', { signalId });
    }
    return released;
  }

  public clearAllReservations(): void {
    this.reservations.clear();
  }

  public updateCurrentDrawdown(drawdown: number): void {
    this.currentDrawdown = Math.max(0.0, drawdown);
  }

  public getExposureSummary(): BridgeExposureSummary {
    const totalReserved = this.getTotalReservedCapital();
    const maxAllowed = this.config.capitalUsd * this.config.maxExposureFraction;
    return {
      capitalUsd: this.config.capitalUsd,
      totalReservedUsd: totalReserved,
      maxAllowedExposureUsd: maxAllowed,
      utilizationPct: maxAllowed > 0 ? (totalReserved / maxAllowed) * 100 : 0,
      activeReservationsCount: this.reservations.size,
    };
  }

  private getTotalReservedCapital(): number {
    let total = 0;
    for (const val of this.reservations.values()) {
      total += val;
    }
    return total;
  }

  private rejectResult(
    signalId: string,
    reason: string,
    reservedCapitalUsd: number,
    currentExposureUsd: number,
    maxAllowedExposureUsd: number,
    timestamp: number,
  ): GuardValidationResult {
    logger.warn('Consensus signal proposal rejected by bridge', { signalId, reason });
    return {
      approved: false,
      signalId,
      reservedCapitalUsd,
      currentExposureUsd,
      maxAllowedExposureUsd,
      rejectionReason: reason,
      timestamp,
    };
  }
}
