/**
 * Live Trading Orchestrator — Fail-Closed PolyRisk & Kill-Switch Gate
 *
 * Bridges `evaluatePolyRisk` (`src/desk/risk/poly-fail-closed-risk-engine.ts`)
 * and `createPolyKillSwitch` (`src/desk/risk/poly-kill-switch.ts`) into the
 * orchestrator's order submission and strategy tick execution paths.
 */

import type { PolymarketOrder } from '../execution/polymarket-signer';
import type { LiveExecutionGuard } from '../execution/live-execution-guard';
import type { LivePositionTracker } from '../execution/live-position-tracker';
import type { LiveTradingJournal } from '../execution/live-trading-journal';
import type { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import type { LiveOrderManager } from '../execution/live-order-manager';
import type { FeeScheduleResolver } from './fee-schedule-resolver';
import type { LiveTradingConfig } from './live-trading-types';
import {
  evaluatePolyRisk,
  type PolyOrderIntent,
  type PolyRiskState,
} from '../risk/poly-fail-closed-risk-engine';
import type { PolyFeeScheduleState } from '../risk/poly-risk-types';
import {
  createPolyCancelAllTransport,
  createPolyKillSwitch,
  type PolyKillSwitch,
} from '../risk/poly-kill-switch';
import { buildPolymarketHeaders } from '../execution/polymarket-adapter-transport';
import { recordPaperOrderCancel } from './live-trading-adapter-setup';

export interface OrchestratorPolyRiskDeps {
  config: LiveTradingConfig;
  getOrderManager: () => LiveOrderManager | null;
  getPositionTracker: () => LivePositionTracker;
  getReconciler: () => PolymarketOrderReconciler;
  getJournal: () => LiveTradingJournal;
}

export interface OrchestratorPolyRiskRuntime {
  readonly killSwitch: PolyKillSwitch;
  getFeeScheduleResolver(): FeeScheduleResolver | null | undefined;
  setFeeScheduleResolver(resolver: FeeScheduleResolver | null): void;
  recordMarketObservation(observedAtMs?: number): void;
  isKillSwitchFired(): boolean;
  beforeOrder(order: PolymarketOrder, orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC'): Promise<void>;
  authorizeOrder(order: PolymarketOrder, guard: LiveExecutionGuard, orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC'): Promise<void>;
  listOpenOrders(tokenId?: string): Array<{ id: string; side: string; price: number; size: number }>;
  cancelMatchingOrders(tokenId?: string): Promise<void>;
  resetPeakEquity(): void;
}

async function resolveRiskFeeState(
  resolver: FeeScheduleResolver | null | undefined,
  tokenId: string,
): Promise<PolyFeeScheduleState | 'unknown'> {
  if (!resolver) return 'unknown';
  try {
    const schedule = await resolver.resolve(tokenId);
    if (schedule === null) return { tokenId, rate: null, exponent: 'unknown' };
    return { tokenId, rate: schedule.rate, exponent: schedule.exponent };
  } catch {
    return 'unknown';
  }
}

function buildLiveCancelAllHeaders(): Record<string, string> {
  const apiKey = process.env['POLYMARKET_API_KEY'] || process.env['POLY_API_KEY'] || '';
  const apiSecret = process.env['POLYMARKET_API_SECRET'] || process.env['POLY_API_SECRET'] || '';
  const passphrase = process.env['POLYMARKET_PASSPHRASE'] || process.env['POLY_PASSPHRASE'] || '';
  return apiKey && apiSecret
    ? buildPolymarketHeaders(apiKey, apiSecret, passphrase, 'DELETE', '/cancel-all')
    : {};
}

export function createOrchestratorPolyRiskRuntime(
  deps: OrchestratorPolyRiskDeps,
): OrchestratorPolyRiskRuntime {
  let feeResolver: FeeScheduleResolver | null | undefined = deps.config.feeScheduleResolver;
  let lastObservedAtMs: number | 'unknown' = 'unknown';
  let peakEquityUsdc = deps.config.capitalUsdc;
  const isGateEnforced = () => deps.config.enforcePolyRiskGate ?? !deps.config.paperTrading;
  const liveTransport =
    deps.config.killSwitchTransport ??
    (deps.config.paperTrading
      ? undefined
      : createPolyCancelAllTransport({
          ...(deps.config.apiUrl ? { host: deps.config.apiUrl } : {}),
          getHeaders: buildLiveCancelAllHeaders,
        }));

  const killSwitch = createPolyKillSwitch({
    cancelAll: async (req) => {
      const reconciler = deps.getReconciler();
      const om = deps.getOrderManager();
      if (om) {
        for (const active of om.getActiveOrders()) {
          await om.cancelOrder(active.orderId);
          recordPaperOrderCancel(reconciler, active.orderId);
        }
      }
      if (liveTransport) return liveTransport(req);
      return { ok: true, status: 200, body: 'paper-cancel-all' };
    },
  });

  const runBeforeOrder = async (
    order: PolymarketOrder,
    orderType: 'GTC' | 'GTD' | 'FOK' | 'IOC' = order.orderType ?? 'GTC',
  ): Promise<void> => {
    const nowMs = Date.now();
    const journal = deps.getJournal();
    const safeTokenPrefix = String(order.tokenId ?? '').slice(0, 12);
    if (killSwitch.isFired()) {
      journal.recordEvent('guard_reject', {
        tokenId: safeTokenPrefix,
        reason: 'KILL_SWITCH_ACTIVE',
      });
      throw new Error('PolyRisk blocked [KILL_SWITCH_ACTIVE]: kill switch is latched; no new order');
    }
    if (!isGateEnforced()) return;

    const feeSchedule = await resolveRiskFeeState(feeResolver, order.tokenId);
    const posSummary = deps.getPositionTracker().getSummary();
    const recSummary = deps.getReconciler().reconcile();
    const reconciled =
      Math.abs(recSummary.unexplainedDriftUsdc) < 1e-6 && recSummary.unknownOrderCount === 0;
    const totalNetPnl = posSummary.totalRealizedPnl + posSummary.totalUnrealizedPnl;
    const currentEquity = deps.config.capitalUsdc + totalNetPnl;
    if (currentEquity > peakEquityUsdc) peakEquityUsdc = currentEquity;
    const maxPosFrac = deps.config.maxPositionFraction ?? 0.02;
    const currentDrawdownPct =
      peakEquityUsdc > 0
        ? Math.max(0, ((peakEquityUsdc - currentEquity) / peakEquityUsdc) * 100)
        : 'unknown';

      const intent: PolyOrderIntent = {
        tokenId: order.tokenId, side: order.side === 'BUY' ? 'buy' : 'sell',
        price: order.price, size: order.size, orderType, expiration: order.expiration,
      };
      const state: PolyRiskState = {
        nowMs, killSwitch: killSwitch.isFired() ? 'active' : 'inactive',
        marketData: { observedAtMs: lastObservedAtMs }, feeSchedule,
        positionReconciliation: { reconciled, reconciledAtMs: nowMs, openPositionCount: posSummary.positionCount },
        riskBudget: { maxNotionalUsd: deps.config.capitalUsdc * maxPosFrac, currentDrawdownPct },
      };
      const verdict = evaluatePolyRisk(intent, state);
      if (verdict.allowed) return;
      if (verdict.reason === 'DRAWDOWN_AUTO_HALT') await killSwitch.fire(verdict.detail);
      journal.recordEvent('guard_reject', {
        tokenId: safeTokenPrefix, reason: `${verdict.reason}: ${verdict.detail}`,
      });
      throw new Error(`PolyRisk blocked [${verdict.reason}]: ${verdict.detail}`);
    };

  const listOpenOrders = (tokenId?: string) => {
    const om = deps.getOrderManager();
    if (om) {
      return om.getActiveOrders()
        .filter((o) => !tokenId || o.tokenId === tokenId)
        .map((o) => ({ id: o.orderId, side: o.side.toLowerCase(), price: o.price, size: o.size }));
    }
    const openStates = new Set(['CREATED', 'SUBMITTED', 'ACKNOWLEDGED', 'PARTIALLY_FILLED']);
    return deps.getReconciler().serialize().orders
      .filter((o) => openStates.has(o.status) && (!tokenId || o.tokenId === tokenId))
      .map((o) => ({ id: o.orderId, side: o.side.toLowerCase(), price: o.limitPrice, size: Math.max(0, o.requestedSize - o.filledSize) }));
  };

  return {
    killSwitch,
    getFeeScheduleResolver: () => feeResolver,
    setFeeScheduleResolver: (resolver) => { feeResolver = resolver; },
    recordMarketObservation: (observedAtMs = Date.now()) => { lastObservedAtMs = observedAtMs; },
    isKillSwitchFired: () => killSwitch.isFired(),
    beforeOrder: runBeforeOrder,
    authorizeOrder: async (order, guard, orderType) => {
      await runBeforeOrder(order, orderType ?? order.orderType);
      const result = guard.guardOrder(order);
      if (!result.approved) {
        deps.getJournal().recordEvent('guard_reject', {
          tokenId: String(order.tokenId ?? '').slice(0, 12),
          reason: result.reason,
        });
        throw new Error(`Guard rejected: ${result.reason}`);
      }
    },
    listOpenOrders,
    cancelMatchingOrders: async (tokenId?: string) => {
      const om = deps.getOrderManager();
      const reconciler = deps.getReconciler();
      for (const open of listOpenOrders(tokenId)) {
        if (om) await om.cancelOrder(open.id);
        recordPaperOrderCancel(reconciler, open.id);
      }
    },
    resetPeakEquity: () => { peakEquityUsdc = deps.config.capitalUsdc; },
  };
}
