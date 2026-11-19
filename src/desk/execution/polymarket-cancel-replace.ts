/**
 * Polymarket CLOB V2 Atomic Cancel/Replace State Machine.
 *
 * Enforces single in-flight cancel/replace per quote slot (blocks double-exposure),
 * defers replaces across HTTP 425 `EngineRestartCooldown`, and promotes the next
 * deterministic `clientOrderId` only after cancel ack or confirmed terminal fill.
 */

import { EngineRestartCooldown } from '../polymarket/clob-v2-submit-classifier';
import {
  deriveDeterministicClientOrderId,
  deriveDeterministicOrderSalt,
  type DeterministicOrderIdInput,
} from './deterministic-client-order-id';

export type CancelReplaceState =
  | 'LIVE' | 'PENDING_CANCEL' | 'PENDING_REPLACE' | 'REPLACED' | 'CANCELLED' | 'FAILED';

export interface CancelReplaceRecord {
  slotId: string; state: CancelReplaceState;
  activeClientOrderId: string; activeSalt: string; activeExchangeOrderId?: string;
  pendingReplaceInput?: DeterministicOrderIdInput; pendingClientOrderId?: string; pendingSalt?: string;
  deferredUntilMs?: number; lastTransitionAtMs: number; failureReason?: string;
  history: CancelReplaceState[];
}

export interface CancelReplaceActionResult {
  accepted: boolean; reason?: string; deferredUntilMs?: number; record: CancelReplaceRecord;
}

function cloneRecord(rec: CancelReplaceRecord): CancelReplaceRecord {
  return { ...rec, pendingReplaceInput: rec.pendingReplaceInput ? { ...rec.pendingReplaceInput } : undefined, history: [...rec.history] };
}

export class PolymarketCancelReplaceManager {
  private readonly slots = new Map<string, CancelReplaceRecord>();

  constructor(private readonly cooldown: EngineRestartCooldown = new EngineRestartCooldown()) {}

  getCooldown(): EngineRestartCooldown { return this.cooldown; }
  getSlot(slotId: string): CancelReplaceRecord | undefined {
    const rec = this.slots.get(slotId);
    return rec ? cloneRecord(rec) : undefined;
  }

  registerLiveOrder(slotId: string, input: DeterministicOrderIdInput, exchangeOrderId: string, nowMs: number): CancelReplaceRecord {
    const existing = this.slots.get(slotId);
    if (
      existing &&
      (existing.state === 'LIVE' || existing.state === 'REPLACED' || existing.state === 'PENDING_CANCEL' || existing.state === 'PENDING_REPLACE')
    ) {
      throw new Error(`Slot ${slotId} already has active order in state ${existing.state}`);
    }
    const record: CancelReplaceRecord = {
      slotId, state: 'LIVE',
      activeClientOrderId: deriveDeterministicClientOrderId(input),
      activeSalt: deriveDeterministicOrderSalt(input),
      activeExchangeOrderId: exchangeOrderId,
      lastTransitionAtMs: nowMs, history: ['LIVE'],
    };
    this.slots.set(slotId, record);
    return cloneRecord(record);
  }

  requestCancel(slotId: string, nowMs: number): CancelReplaceActionResult {
    const rec = this.requireSlot(slotId);
    if (rec.state === 'PENDING_CANCEL' || rec.state === 'PENDING_REPLACE') return this.reject(rec, 'IN_FLIGHT_CANCEL_OR_REPLACE');
    if (rec.state !== 'LIVE' && rec.state !== 'REPLACED') return this.reject(rec, `CANNOT_CANCEL_FROM_${rec.state}`);
    rec.pendingReplaceInput = rec.pendingClientOrderId = rec.pendingSalt = rec.deferredUntilMs = undefined;
    this.transition(rec, 'PENDING_CANCEL', nowMs);
    return { accepted: true, record: cloneRecord(rec) };
  }

  requestReplace(slotId: string, nextInput: DeterministicOrderIdInput, nowMs: number): CancelReplaceActionResult {
    const rec = this.requireSlot(slotId);
    if (rec.state === 'PENDING_CANCEL' || rec.state === 'PENDING_REPLACE') return this.reject(rec, 'IN_FLIGHT_CANCEL_OR_REPLACE');
    if (rec.state !== 'LIVE' && rec.state !== 'REPLACED') return this.reject(rec, `CANNOT_REPLACE_FROM_${rec.state}`);
    rec.pendingReplaceInput = { ...nextInput };
    rec.pendingClientOrderId = deriveDeterministicClientOrderId(nextInput);
    rec.pendingSalt = deriveDeterministicOrderSalt(nextInput);
    if (this.cooldown.requiresPostOnly(nowMs)) return this.defer(rec, nowMs);
    rec.deferredUntilMs = undefined;
    this.transition(rec, 'PENDING_CANCEL', nowMs);
    return { accepted: true, record: cloneRecord(rec) };
  }

  noteHttp425(slotId: string, nowMs: number): CancelReplaceActionResult {
    const rec = this.requireSlot(slotId);
    this.cooldown.noteEngineRestart(nowMs);
    return this.defer(rec, nowMs);
  }

  onCancelAck(slotId: string, nowMs: number): CancelReplaceActionResult {
    const rec = this.requireSlot(slotId);
    if (rec.state !== 'PENDING_CANCEL') return this.reject(rec, `UNEXPECTED_CANCEL_ACK_IN_${rec.state}`);
    return this.completePriorTermination(rec, nowMs);
  }

  onTerminalFill(slotId: string, nowMs: number): CancelReplaceActionResult {
    const rec = this.requireSlot(slotId);
    if (rec.state !== 'PENDING_CANCEL' && rec.state !== 'LIVE' && rec.state !== 'REPLACED') {
      return this.reject(rec, `UNEXPECTED_TERMINAL_FILL_IN_${rec.state}`);
    }
    return this.completePriorTermination(rec, nowMs);
  }

  retryDeferredReplace(slotId: string, nowMs: number): CancelReplaceActionResult {
    const rec = this.requireSlot(slotId);
    if (this.cooldown.requiresPostOnly(nowMs)) return this.defer(rec, nowMs);
    if (rec.deferredUntilMs === undefined || !rec.pendingClientOrderId || !rec.pendingSalt) {
      return this.reject(rec, 'NO_DEFERRED_REPLACE');
    }
    rec.deferredUntilMs = undefined;
    if (rec.state === 'LIVE' || rec.state === 'REPLACED') {
      this.transition(rec, 'PENDING_CANCEL', nowMs);
      return { accepted: true, record: cloneRecord(rec) };
    }
    if (rec.state === 'PENDING_REPLACE') {
      this.promotePending(rec, nowMs);
      return { accepted: true, record: cloneRecord(rec) };
    }
    return this.reject(rec, `CANNOT_RETRY_DEFERRED_IN_${rec.state}`);
  }

  onReplaceAck(slotId: string, newExchangeOrderId: string, nowMs: number): CancelReplaceActionResult {
    const rec = this.requireSlot(slotId);
    if (rec.state !== 'PENDING_REPLACE' || rec.deferredUntilMs !== undefined) {
      return this.reject(rec, `UNEXPECTED_REPLACE_ACK_IN_${rec.state}`);
    }
    rec.activeExchangeOrderId = newExchangeOrderId;
    rec.pendingReplaceInput = rec.pendingClientOrderId = rec.pendingSalt = undefined;
    this.transition(rec, 'REPLACED', nowMs);
    return { accepted: true, record: cloneRecord(rec) };
  }

  onFailure(slotId: string, reason: string, nowMs: number): CancelReplaceActionResult {
    const rec = this.requireSlot(slotId);
    rec.failureReason = reason;
    rec.deferredUntilMs = undefined;
    this.transition(rec, 'FAILED', nowMs);
    return this.reject(rec, reason);
  }

  private completePriorTermination(rec: CancelReplaceRecord, nowMs: number): CancelReplaceActionResult {
    if (!rec.pendingClientOrderId || !rec.pendingSalt) {
      rec.activeExchangeOrderId = undefined;
      this.transition(rec, 'CANCELLED', nowMs);
      return { accepted: true, record: cloneRecord(rec) };
    }
    if (this.cooldown.requiresPostOnly(nowMs)) {
      this.transition(rec, 'PENDING_REPLACE', nowMs);
      return this.defer(rec, nowMs);
    }
    this.promotePending(rec, nowMs);
    this.transition(rec, 'PENDING_REPLACE', nowMs);
    return { accepted: true, record: cloneRecord(rec) };
  }

  private defer(rec: CancelReplaceRecord, nowMs: number): CancelReplaceActionResult {
    const deferredUntilMs = nowMs + this.cooldown.remainingMs(nowMs);
    rec.deferredUntilMs = deferredUntilMs;
    rec.lastTransitionAtMs = nowMs;
    return { accepted: false, reason: 'ENGINE_RESTART_COOLDOWN_DEFERRED', deferredUntilMs, record: cloneRecord(rec) };
  }

  private reject(rec: CancelReplaceRecord, reason: string): CancelReplaceActionResult {
    return { accepted: false, reason, record: cloneRecord(rec) };
  }

  private promotePending(rec: CancelReplaceRecord, nowMs: number): void {
    rec.activeClientOrderId = rec.pendingClientOrderId!;
    rec.activeSalt = rec.pendingSalt!;
    rec.activeExchangeOrderId = rec.deferredUntilMs = undefined;
    rec.lastTransitionAtMs = nowMs;
  }

  private transition(rec: CancelReplaceRecord, next: CancelReplaceState, nowMs: number): void {
    rec.state = next;
    rec.lastTransitionAtMs = nowMs;
    rec.history.push(next);
  }

  private requireSlot(slotId: string): CancelReplaceRecord {
    const rec = this.slots.get(slotId);
    if (!rec) throw new Error(`Unknown cancel/replace quote slot: ${slotId}`);
    return rec;
  }
}
