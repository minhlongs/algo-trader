/**
 * Polymarket Order Lifecycle Reconciler & Deterministic Accounting Ledger (Stage S4)
 *
 * State machine:
 *   CREATED -> SUBMITTED -> ACKNOWLEDGED -> PARTIALLY_FILLED -> FILLED | CANCELLED | REJECTED | UNKNOWN
 *
 * Guarantees idempotency by `intentId`/`eventId`, blocks new orders on any market
 * with an unresolved `UNKNOWN` order, reconciles cash/fees/positions with zero drift,
 * and maintains an `IntegerMicroUnitFifoLedger` (`POLY-ALPHA-HUNTER-V4` §13.2).
 */

import { IntegerMicroUnitFifoLedger } from './integer-micro-unit-fifo-ledger';
import {
  buildFifoSummary,
  hydrateFifoLedger,
  recordFillInFifoLedger,
  serializeFifoLedger,
  type FifoLedgerSnapshot,
  type ReconcilerFifoSummary,
} from './polymarket-order-reconciler-ledger';

export type { FifoLedgerSnapshot, ReconcilerFifoSummary };
export type ReconcilerOrderStatus = 'CREATED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'UNKNOWN';
export type OrderLifecycleEventType = 'SUBMITTED' | 'ACKNOWLEDGED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'TIMEOUT_UNKNOWN';

export interface CreateReconciledOrderInput {
  intentId: string;
  orderId: string;
  marketId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  requestedSize: number;
  limitPrice: number;
  timestamp: number;
}

export interface ReconciledOrderRecord extends CreateReconciledOrderInput {
  status: ReconcilerOrderStatus;
  filledSize: number;
  avgFillPrice: number;
  feesPaidUsdc: number;
  updatedAt: number;
}

export interface OrderLifecycleEvent {
  eventId: string;
  orderId: string;
  type: OrderLifecycleEventType;
  fillSize?: number;
  fillPrice?: number;
  feeUsdc?: number;
  rebateUsdc?: number;
  liquidityRewardUsdc?: number;
  timestamp: number;
}

export interface ReconciliationSummary {
  initialCashUsdc: number;
  cashUsdc: number;
  totalFeesUsdc: number;
  netCashFlowFromFillsUsdc: number;
  unexplainedDriftUsdc: number;
  unknownOrderCount: number;
  positionsByToken: Record<string, number>;
  fifoLedger?: ReconcilerFifoSummary;
}

export interface ReconcilerSnapshot {
  initialCashUsdc: number;
  cashUsdc: number;
  totalFeesUsdc: number;
  netFillCashDeltaUsdc: number;
  orders: ReconciledOrderRecord[];
  intents: string[];
  processedEvents: string[];
  positionsByToken: Record<string, number>;
  fifoLedger?: FifoLedgerSnapshot;
}

export class PolymarketOrderReconciler {
  private readonly orders = new Map<string, ReconciledOrderRecord>();
  private readonly intents = new Set<string>();
  private readonly processedEvents = new Set<string>();
  private readonly positions = new Map<string, number>();
  private readonly fifoLedger = new IntegerMicroUnitFifoLedger();
  private cashUsdc: number;
  private totalFeesUsdc = 0;
  private netFillCashDeltaUsdc = 0;

  constructor(private initialCashUsdc: number = 1000) { this.cashUsdc = initialCashUsdc; }

  getFifoLedger(): IntegerMicroUnitFifoLedger { return this.fifoLedger; }
  getOrder(orderId: string): ReconciledOrderRecord | undefined {
    const rec = this.orders.get(orderId);
    return rec ? { ...rec } : undefined;
  }

  createOrder(input: CreateReconciledOrderInput): ReconciledOrderRecord {
    if (this.intents.has(input.intentId)) throw new Error(`Duplicate order intent: ${input.intentId}`);
    if (this.hasUnknownOrderOnMarket(input.marketId)) {
      throw new Error(`Market ${input.marketId} blocked: has unresolved UNKNOWN order awaiting reconciliation`);
    }
    const record: ReconciledOrderRecord = {
      ...input, status: 'CREATED', filledSize: 0, avgFillPrice: 0, feesPaidUsdc: 0, updatedAt: input.timestamp,
    };
    this.intents.add(input.intentId);
    this.orders.set(input.orderId, record);
    return { ...record };
  }

  hasUnknownOrderOnMarket(marketId: string): boolean {
    for (const ord of this.orders.values()) if (ord.marketId === marketId && ord.status === 'UNKNOWN') return true;
    return false;
  }

  applyEvent(event: OrderLifecycleEvent): ReconciledOrderRecord {
    const order = this.orders.get(event.orderId);
    if (!order) throw new Error(`Unknown orderId in lifecycle event: ${event.orderId}`);
    if (this.processedEvents.has(event.eventId)) return { ...order };
    this.processedEvents.add(event.eventId);

    switch (event.type) {
      case 'SUBMITTED': if (order.status === 'CREATED') order.status = 'SUBMITTED'; break;
      case 'ACKNOWLEDGED': if (order.status === 'CREATED' || order.status === 'SUBMITTED') order.status = 'ACKNOWLEDGED'; break;
      case 'PARTIALLY_FILLED':
      case 'FILLED': {
        const deltaSize = event.fillSize ?? 0;
        const fillPrice = event.fillPrice ?? order.limitPrice;
        const fee = event.feeUsdc ?? 0;
        if (deltaSize > 0) {
          recordFillInFifoLedger(this.fifoLedger, order, event);
          const nextSize = order.filledSize + deltaSize;
          order.avgFillPrice = (order.filledSize * order.avgFillPrice + deltaSize * fillPrice) / nextSize;
          order.filledSize = nextSize;
          order.feesPaidUsdc += fee;
          const cashDelta = (order.side === 'BUY' ? -1 : 1) * deltaSize * fillPrice;
          this.cashUsdc += cashDelta - fee;
          this.netFillCashDeltaUsdc += cashDelta;
          this.totalFeesUsdc += fee;
          const curPos = this.positions.get(order.tokenId) ?? 0;
          this.positions.set(order.tokenId, order.side === 'BUY' ? curPos + deltaSize : curPos - deltaSize);
        }
        order.status = event.type === 'FILLED' || order.filledSize >= order.requestedSize ? 'FILLED' : 'PARTIALLY_FILLED';
        break;
      }
      case 'CANCELLED': order.status = 'CANCELLED'; break;
      case 'REJECTED': order.status = 'REJECTED'; break;
      case 'TIMEOUT_UNKNOWN': order.status = 'UNKNOWN'; break;
    }
    order.updatedAt = Math.max(order.updatedAt, event.timestamp);
    return { ...order };
  }

  reconcile(): ReconciliationSummary {
    const expectedCash = this.initialCashUsdc + this.netFillCashDeltaUsdc - this.totalFeesUsdc;
    const rawDrift = Math.abs(this.cashUsdc - expectedCash);
    let unknownOrderCount = 0;
    for (const o of this.orders.values()) if (o.status === 'UNKNOWN') unknownOrderCount++;
    return {
      initialCashUsdc: this.initialCashUsdc, cashUsdc: this.cashUsdc, totalFeesUsdc: this.totalFeesUsdc,
      netCashFlowFromFillsUsdc: this.netFillCashDeltaUsdc, unexplainedDriftUsdc: rawDrift < 1e-9 ? 0 : rawDrift,
      unknownOrderCount, positionsByToken: Object.fromEntries(this.positions.entries()),
      fifoLedger: buildFifoSummary(this.fifoLedger),
    };
  }

  serialize(): ReconcilerSnapshot {
    return {
      initialCashUsdc: this.initialCashUsdc, cashUsdc: this.cashUsdc, totalFeesUsdc: this.totalFeesUsdc,
      netFillCashDeltaUsdc: this.netFillCashDeltaUsdc,
      orders: Array.from(this.orders.values()).map((o) => ({ ...o })),
      intents: Array.from(this.intents), processedEvents: Array.from(this.processedEvents),
      positionsByToken: Object.fromEntries(this.positions.entries()),
      fifoLedger: serializeFifoLedger(this.fifoLedger),
    };
  }

  hydrate(snapshot: ReconcilerSnapshot): void {
    this.initialCashUsdc = snapshot.initialCashUsdc;
    this.cashUsdc = snapshot.cashUsdc;
    this.totalFeesUsdc = snapshot.totalFeesUsdc;
    this.netFillCashDeltaUsdc = snapshot.netFillCashDeltaUsdc;
    this.orders.clear();
    for (const o of snapshot.orders ?? []) this.orders.set(o.orderId, { ...o });
    this.intents.clear();
    for (const id of snapshot.intents ?? []) this.intents.add(id);
    this.processedEvents.clear();
    for (const ev of snapshot.processedEvents ?? []) this.processedEvents.add(ev);
    this.positions.clear();
    for (const [k, v] of Object.entries(snapshot.positionsByToken ?? {})) this.positions.set(k, v);
    hydrateFifoLedger(this.fifoLedger, snapshot.fifoLedger, snapshot.positionsByToken ?? {}, snapshot.orders ?? []);
  }
}
