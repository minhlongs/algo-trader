/**
 * Polymarket CLOB V2 Pre-Trade Risk Gate Bridge
 *
 * Maps UnifiedTradeIntent (Orchestrator / Dispatcher) and TradeSignal (LiveOrderManager)
 * into deterministic micro-unit PreTradeOrderCandidateV2 payloads for validation by
 * PolymarketV2PreTradeRiskGate.
 */

import { MICRO_PER_PUSD } from './integer-micro-unit-fifo-ledger';
import type {
  PolymarketV2PreTradeRiskGate,
  PreTradeOrderCandidateV2,
  PreTradeValidationResultV2,
} from './polymarket-v2-pretrade-risk-gate';
import type { PolymarketOrder } from './polymarket-signer';
import type { LivePositionTracker } from './live-position-tracker';
import type { LiveTradingJournal } from './live-trading-journal';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import type { TradeSignal } from '../polymarket/strategy-live-bridge-types';

export interface PolymarketV2RiskContext {
  readonly rawFreeBalanceUsd?: number;
  readonly currentMarketExposureUsd?: number;
  readonly tickSizeMicro?: number;
  readonly isPositionReducing?: boolean;
  readonly currentVpin?: number;
  readonly clusterCvar99Pct?: number;
  readonly consecutiveBookErrors?: number;
}

function readNumMeta(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const raw = meta?.[key];
  return typeof raw === 'number' ? raw : fallback;
}

function readBoolMeta(meta: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const raw = meta?.[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

function resolveBalanceAndExposureMicro(
  ctx: PolymarketV2RiskContext,
  overrideFreeMicro: number | undefined,
  overrideExposureMicro: number | undefined,
): { rawFreeBalanceMicro: number; currentMarketExposureMicro: number } {
  const ctxFreeMicro =
    ctx.rawFreeBalanceUsd !== undefined && Number.isFinite(ctx.rawFreeBalanceUsd)
      ? Math.round(ctx.rawFreeBalanceUsd * MICRO_PER_PUSD)
      : undefined;
  const rawFreeBalanceMicro =
    ctxFreeMicro !== undefined && overrideFreeMicro !== undefined
      ? Math.min(ctxFreeMicro, overrideFreeMicro)
      : (ctxFreeMicro ?? overrideFreeMicro ?? 50_000 * MICRO_PER_PUSD);

  const ctxExposureMicro =
    ctx.currentMarketExposureUsd !== undefined && Number.isFinite(ctx.currentMarketExposureUsd)
      ? Math.round(ctx.currentMarketExposureUsd * MICRO_PER_PUSD)
      : undefined;
  const currentMarketExposureMicro =
    ctxExposureMicro !== undefined && overrideExposureMicro !== undefined
      ? Math.max(ctxExposureMicro, overrideExposureMicro)
      : (ctxExposureMicro ?? overrideExposureMicro ?? 0);

  return { rawFreeBalanceMicro, currentMarketExposureMicro };
}

/** Convert a UnifiedTradeIntent targeting `polymarket_clob` into a `PreTradeOrderCandidateV2`. */
export function buildPreTradeCandidateFromIntent(
  intent: UnifiedTradeIntent,
  unitPrice: number,
  scaledQuantity: number,
  ctx: PolymarketV2RiskContext = {},
): PreTradeOrderCandidateV2 {
  const meta = intent.metadata;
  const defaultIsLimit = intent.orderType === 'LIMIT' || intent.orderType === 'TWO_SIDED_QUOTE';
  const isLimitOrder = readBoolMeta(meta, 'isLimitOrder', defaultIsLimit);
  const { rawFreeBalanceMicro, currentMarketExposureMicro } = resolveBalanceAndExposureMicro(
    ctx,
    typeof meta?.rawFreeBalanceMicro === 'number' ? meta.rawFreeBalanceMicro : undefined,
    typeof meta?.currentMarketExposureMicro === 'number' ? meta.currentMarketExposureMicro : undefined,
  );

  return {
    priceMicro: Math.round(unitPrice * MICRO_PER_PUSD),
    sharesMicro: Math.round(scaledQuantity * MICRO_PER_PUSD),
    tickSizeMicro: readNumMeta(meta, 'tickSizeMicro', ctx.tickSizeMicro ?? 1_000),
    isLimitOrder,
    isMarketBuyFakOrFok: readBoolMeta(meta, 'isMarketBuyFakOrFok', !isLimitOrder && intent.side === 'BUY'),
    isPositionReducing: readBoolMeta(meta, 'isPositionReducing', Boolean(ctx.isPositionReducing)),
    rawFreeBalanceMicro,
    currentMarketExposureMicro,
    currentVpin: readNumMeta(meta, 'currentVpin', ctx.currentVpin ?? 0),
    clusterCvar99Pct: readNumMeta(meta, 'clusterCvar99Pct', ctx.clusterCvar99Pct ?? 0),
    consecutiveBookErrors: readNumMeta(meta, 'consecutiveBookErrors', ctx.consecutiveBookErrors ?? 0),
  };
}

/** Validate a `UnifiedTradeIntent` through `PolymarketV2PreTradeRiskGate` when `intent.venue === 'polymarket_clob'`. */
export function validateIntentWithPolymarketV2Gate(
  gate: PolymarketV2PreTradeRiskGate,
  intent: UnifiedTradeIntent,
  unitPrice: number,
  scaledQuantity: number,
  ctx: PolymarketV2RiskContext = {},
): PreTradeValidationResultV2 {
  if (intent.venue !== 'polymarket_clob') {
    return {
      allowed: true,
      effectiveFreeBalanceMicro: 0,
      requiredNotionalMicro: 0,
      sanitizedNotionalMicro: 0,
    };
  }
  return gate.validateOrder(buildPreTradeCandidateFromIntent(intent, unitPrice, scaledQuantity, ctx));
}

/** Validate a `TradeSignal` through `PolymarketV2PreTradeRiskGate` before CLOB submission. */
export function validateSignalWithPolymarketV2Gate(
  gate: PolymarketV2PreTradeRiskGate,
  signal: TradeSignal,
  ctx: PolymarketV2RiskContext = {},
): PreTradeValidationResultV2 {
  const isLimitOrder = signal.isLimitOrder ?? (signal.orderType !== 'IOC' && signal.orderType !== 'FOK');
  const { rawFreeBalanceMicro, currentMarketExposureMicro } = resolveBalanceAndExposureMicro(
    ctx,
    signal.rawFreeBalanceMicro,
    signal.currentMarketExposureMicro,
  );

  return gate.validateOrder({
    priceMicro: Math.round(signal.price * MICRO_PER_PUSD),
    sharesMicro: Math.round(signal.size * MICRO_PER_PUSD),
    tickSizeMicro: signal.tickSizeMicro ?? ctx.tickSizeMicro ?? 1_000,
    isLimitOrder,
    isMarketBuyFakOrFok: !isLimitOrder && signal.side === 'BUY',
    isPositionReducing: Boolean(ctx.isPositionReducing),
    rawFreeBalanceMicro,
    currentMarketExposureMicro,
    currentVpin: signal.currentVpin ?? ctx.currentVpin ?? 0,
    clusterCvar99Pct: signal.clusterCvar99Pct ?? ctx.clusterCvar99Pct ?? 0,
    consecutiveBookErrors: signal.consecutiveBookErrors ?? ctx.consecutiveBookErrors ?? 0,
  });
}

/** Validate a direct order against PolymarketV2PreTradeRiskGate; fail closed on non-finite terms. */
export function validateOrchestratorOrderV2(params: {
  polymarketV2Gate: PolymarketV2PreTradeRiskGate;
  positionTracker: LivePositionTracker;
  journal: LiveTradingJournal;
  order: PolymarketOrder;
  getTickSizeMicro?: (tokenId: string) => number;
  getRiskContext?: (tokenId: string) => { currentVpin?: number; consecutiveBookErrors?: number };
}): void {
  const raw = params.order as unknown as Record<string, unknown>;
  if (params.order.price === undefined && params.order.size === undefined && raw['makerAmount'] !== undefined) {
    return;
  }
  if (!Number.isFinite(params.order.price) || !Number.isFinite(params.order.size)) {
    const reason = 'NON_FINITE_ORDER_TERMS';
    params.journal.recordEvent('v2_risk_gate_reject', {
      tokenId: String(params.order.tokenId ?? '').slice(0, 12),
      reason,
    });
    throw new Error(`RISK_GATE_REJECTED: ${reason}`);
  }
  const riskCtx = params.getRiskContext?.(params.order.tokenId);
  const v2Result = validateSignalWithPolymarketV2Gate(
    params.polymarketV2Gate,
    {
      tokenId: params.order.tokenId,
      side: params.order.side,
      price: params.order.price,
      size: params.order.size,
      orderType: params.order.orderType,
      timestamp: Date.now(),
    },
    {
      rawFreeBalanceUsd: params.positionTracker.getFreeBalanceUsd(),
      currentMarketExposureUsd: params.positionTracker.getTokenExposureUsd(params.order.tokenId),
      tickSizeMicro: params.getTickSizeMicro?.(params.order.tokenId),
      isPositionReducing: params.positionTracker.isPositionReducingOrder(
        params.order.tokenId,
        params.order.side,
        params.order.size,
      ),
      currentVpin: riskCtx?.currentVpin,
      consecutiveBookErrors: riskCtx?.consecutiveBookErrors,
    },
  );
  if (!v2Result.allowed) {
    const reason = v2Result.reason ?? 'POLYMARKET_V2_GATE_REJECTED';
    params.journal.recordEvent('v2_risk_gate_reject', {
      tokenId: params.order.tokenId.slice(0, 12),
      reason,
    });
    throw new Error(`RISK_GATE_REJECTED: ${reason}`);
  }
}
