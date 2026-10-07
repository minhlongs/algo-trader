/**
 * Gnosis CTF Settlement Relayer
 *
 * Evaluates binary conditional token resolution reports, computes payout redemptions,
 * and sequences atomic redemption transactions using RelayerNonceManager.
 *
 * @module desk/polymarket/gnosis-ctf-settlement-relayer
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { RelayerNonceManager } from './relayer-nonce-manager';
import type {
  ConditionPayoutReport,
  PositionHolding,
  RedemptionResult,
} from './gnosis-ctf-settlement-types';

export class GnosisCtfSettlementRelayer extends EventEmitter {
  private readonly nonceManager: RelayerNonceManager;
  private conditions = new Map<string, ConditionPayoutReport>();

  constructor(relayerAddress: string, initialNonce: number = 0) {
    super();
    this.nonceManager = new RelayerNonceManager(relayerAddress, initialNonce);
  }

  public registerCondition(report: ConditionPayoutReport): void {
    this.conditions.set(report.conditionId, report);
    if (report.isResolved) {
      this.emit('conditionResolved', report);
    }
  }

  public calculatePayout(position: PositionHolding): number {
    const report = this.conditions.get(position.conditionId);
    if (!report || !report.isResolved || report.payoutDenominator === 0) return 0;

    let totalPayout = 0;
    for (let slot = 0; slot < report.outcomeSlotCount; slot++) {
      if ((position.indexSet & (1 << slot)) !== 0) {
        const numerator = report.payoutNumerators[slot] ?? 0;
        totalPayout += (position.shares * numerator) / report.payoutDenominator;
      }
    }
    return totalPayout;
  }

  public async executeRedemption(position: PositionHolding): Promise<RedemptionResult | null> {
    const payoutUsd = this.calculatePayout(position);
    if (payoutUsd <= 0) return null;

    await this.nonceManager.acquire();
    try {
      const nonce = await this.nonceManager.getNext();
      const redemption: RedemptionResult = {
        redemptionId: `redemption-${randomUUID()}`,
        conditionId: position.conditionId,
        collateralAmountReceivedUsd: payoutUsd,
        nonceUsed: nonce,
        txHash: `0xmock-${randomUUID().replace(/-/g, '')}`,
        timestamp: Date.now(),
      };

      this.emit('redemptionSuccess', redemption);
      return redemption;
    } finally {
      this.nonceManager.release();
    }
  }

  public getCondition(conditionId: string): ConditionPayoutReport | undefined {
    return this.conditions.get(conditionId);
  }
}
