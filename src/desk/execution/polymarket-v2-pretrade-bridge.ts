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

function readNumMeta(
  meta: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  const raw = meta?.[key];
  return typeof raw === 'number' ? raw : fallback;
}

function readBoolMeta(
  meta: Record<string, unknown> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const raw = meta?.[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

/**
 * Convert a UnifiedTradeIntent targeting `polymarket_clob` into a `PreTradeOrderCandidateV2`.
 */
export function buildPreTradeCandidateFromIntent(
  intent: UnifiedTradeIntent,
  unitPrice: number,
  scaledQuantity: number,
  ctx: PolymarketV2RiskContext = {},
): PreTradeOrderCandidateV2 {
  const meta = intent.metadata;
  const priceMicro = Math.round(unitPrice * MICRO_PER_PUSD);
  const sharesMicro = Math.round(scaledQuantity * MICRO_PER_PUSD);
  const tickSizeMicro = readNumMeta(meta, 'tickSizeMicro', ctx.tickSizeMicro ?? 1_000);
  const defaultIsLimit = intent.orderType === 'LIMIT' || intent.orderType === 'TWO_SIDED_QUOTE';
  const isLimitOrder = readBoolMeta(meta, 'isLimitOrder', defaultIsLimit);
  const isMarketBuyFakOrFok = readBoolMeta(
    meta,
    'isMarketBuyFakOrFok',
    !isLimitOrder && intent.side === 'BUY',
  );

  const ctxFreeMicro =
    ctx.rawFreeBalanceUsd !== undefined && Number.isFinite(ctx.rawFreeBalanceUsd)
      ? Math.round(ctx.rawFreeBalanceUsd * MICRO_PER_PUSD)
      : undefined;
  const metaFreeMicro = typeof meta?.rawFreeBalanceMicro === 'number' ? meta.rawFreeBalanceMicro : undefined;
  const rawFreeBalanceMicro =
    ctxFreeMicro !== undefined && metaFreeMicro !== undefined
      ? Math.min(ctxFreeMicro, metaFreeMicro)
      : (ctxFreeMicro ?? metaFreeMicro ?? 50_000 * MICRO_PER_PUSD);

  const ctxExposureMicro =
    ctx.currentMarketExposureUsd !== undefined && Number.isFinite(ctx.currentMarketExposureUsd)
      ? Math.round(ctx.currentMarketExposureUsd * MICRO_PER_PUSD)
      : undefined;
  const metaExposureMicro =
    typeof meta?.currentMarketExposureMicro === 'number' ? meta.currentMarketExposureMicro : undefined;
  const currentMarketExposureMicro =
    ctxExposureMicro !== undefined && metaExposureMicro !== undefined
      ? Math.max(ctxExposureMicro, metaExposureMicro)
      : (ctxExposureMicro ?? metaExposureMicro ?? 0);

  return {
    priceMicro,
    sharesMicro,
    tickSizeMicro,
    isLimitOrder,
    isMarketBuyFakOrFok,
    isPositionReducing: readBoolMeta(meta, 'isPositionReducing', Boolean(ctx.isPositionReducing)),
    rawFreeBalanceMicro,
    currentMarketExposureMicro,
    currentVpin: readNumMeta(meta, 'currentVpin', ctx.currentVpin ?? 0),
    clusterCvar99Pct: readNumMeta(meta, 'clusterCvar99Pct', ctx.clusterCvar99Pct ?? 0),
    consecutiveBookErrors: readNumMeta(
      meta,
      'consecutiveBookErrors',
      ctx.consecutiveBookErrors ?? 0,
    ),
  };
}

/**
 * Validate a `UnifiedTradeIntent` through `PolymarketV2PreTradeRiskGate` when
 * `intent.venue === 'polymarket_clob'`. Non-Polymarket venues are approved automatically.
 */
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
  const candidate = buildPreTradeCandidateFromIntent(intent, unitPrice, scaledQuantity, ctx);
  return gate.validateOrder(candidate);
}

/**
 * Validate a `TradeSignal` through `PolymarketV2PreTradeRiskGate` before CLOB submission.
 */
export function validateSignalWithPolymarketV2Gate(
  gate: PolymarketV2PreTradeRiskGate,
  signal: TradeSignal,
  ctx: PolymarketV2RiskContext = {},
): PreTradeValidationResultV2 {
  const priceMicro = Math.round(signal.price * MICRO_PER_PUSD);
  const sharesMicro = Math.round(signal.size * MICRO_PER_PUSD);
  const isLimitOrder = signal.isLimitOrder ?? true;
  const fallbackFreeMicro = Math.round((ctx.rawFreeBalanceUsd ?? 50_000) * MICRO_PER_PUSD);
  const fallbackExposureMicro = Math.round((ctx.currentMarketExposureUsd ?? 0) * MICRO_PER_PUSD);

  return gate.validateOrder({
    priceMicro,
    sharesMicro,
    tickSizeMicro: signal.tickSizeMicro ?? ctx.tickSizeMicro ?? 1_000,
    isLimitOrder,
    isMarketBuyFakOrFok: !isLimitOrder && signal.side === 'BUY',
    isPositionReducing: Boolean(ctx.isPositionReducing),
    rawFreeBalanceMicro: signal.rawFreeBalanceMicro ?? fallbackFreeMicro,
    currentMarketExposureMicro: signal.currentMarketExposureMicro ?? fallbackExposureMicro,
    currentVpin: signal.currentVpin ?? ctx.currentVpin ?? 0,
    clusterCvar99Pct: signal.clusterCvar99Pct ?? ctx.clusterCvar99Pct ?? 0,
    consecutiveBookErrors: signal.consecutiveBookErrors ?? ctx.consecutiveBookErrors ?? 0,
  });
}

/** Validate a direct order against PolymarketV2PreTradeRiskGate when numeric price & size are present. */
export function validateOrchestratorOrderV2(params: {
  polymarketV2Gate: PolymarketV2PreTradeRiskGate;
  positionTracker: LivePositionTracker;
  journal: LiveTradingJournal;
  order: PolymarketOrder;
  getTickSizeMicro?: (tokenId: string) => number;
}): void {
  if (typeof params.order.price !== 'number' || typeof params.order.size !== 'number') return;
  const v2Result = validateSignalWithPolymarketV2Gate(
    params.polymarketV2Gate,
    {
      tokenId: params.order.tokenId,
      side: params.order.side,
      price: params.order.price,
      size: params.order.size,
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
