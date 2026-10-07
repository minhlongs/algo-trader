/**
 * Atomic Delivery-versus-Payment (DvP) Settlement Relayer
 * Coordinates multi-phase escrow locks, receipt validation, and cryptographic timeout rollbacks.
 *
 * @module desk/clearing/dvp-settlement-relayer
 */

import type {
  DvPExecutionOutcome,
  DvPPhase,
  DvPSwapIntent,
  SettlementReceipt,
} from './dvp-settlement-types';

export class DvpSettlementRelayer {
  private readonly requiredConfirmations: number;
  private readonly tradeStates = new Map<string, { intent: DvPSwapIntent; phase: DvPPhase }>();

  public constructor(requiredConfirmations: number = 3) {
    this.requiredConfirmations = requiredConfirmations;
  }

  public registerIntent(intent: DvPSwapIntent): DvPExecutionOutcome {
    if (this.tradeStates.has(intent.tradeId)) {
      return {
        tradeId: intent.tradeId,
        phase: 'FAILED',
        isCompleted: false,
        isRollbackApplied: false,
        failureReason: 'Trade intent already exists',
      };
    }

    this.tradeStates.set(intent.tradeId, { intent, phase: 'ESCROW_LOCKED' });

    return {
      tradeId: intent.tradeId,
      phase: 'ESCROW_LOCKED',
      isCompleted: false,
      isRollbackApplied: false,
    };
  }

  public confirmSettlement(
    tradeId: string,
    makerReceipt: SettlementReceipt,
    takerReceipt: SettlementReceipt,
    currentTimestampMs: number
  ): DvPExecutionOutcome {
    const record = this.tradeStates.get(tradeId);
    if (!record) {
      return {
        tradeId,
        phase: 'FAILED',
        isCompleted: false,
        isRollbackApplied: false,
        failureReason: 'Unknown trade ID',
      };
    }

    // 1. Timeout Check: If current time exceeds intent expiry, trigger rollback
    if (currentTimestampMs >= record.intent.expiryTimestampMs) {
      record.phase = 'REFUNDED';
      return {
        tradeId,
        phase: 'REFUNDED',
        isCompleted: false,
        isRollbackApplied: true,
        failureReason: 'Settlement window expired before confirmation',
      };
    }

    // 2. Receipt verification
    const isMakerValid = makerReceipt.status === 'SUCCESS' && makerReceipt.confirmations >= this.requiredConfirmations;
    const isTakerValid = takerReceipt.status === 'SUCCESS' && takerReceipt.confirmations >= this.requiredConfirmations;

    if (isMakerValid && isTakerValid) {
      record.phase = 'SETTLED';
      return {
        tradeId,
        phase: 'SETTLED',
        isCompleted: true,
        isRollbackApplied: false,
        settledAtTimestampMs: currentTimestampMs,
      };
    }

    // If any receipt explicitly reverted, execute atomic refund rollback
    if (makerReceipt.status === 'REVERTED' || takerReceipt.status === 'REVERTED') {
      record.phase = 'REFUNDED';
      return {
        tradeId,
        phase: 'REFUNDED',
        isCompleted: false,
        isRollbackApplied: true,
        failureReason: 'One or more transaction legs reverted on-chain',
      };
    }

    // Still pending confirmations
    record.phase = 'EXECUTING';
    return {
      tradeId,
      phase: 'EXECUTING',
      isCompleted: false,
      isRollbackApplied: false,
    };
  }

  public getTradePhase(tradeId: string): DvPPhase | undefined {
    return this.tradeStates.get(tradeId)?.phase;
  }
}
