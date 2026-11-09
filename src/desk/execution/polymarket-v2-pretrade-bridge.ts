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
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import type { TradeSignal } from '../polymarket/strategy-live-bridge-types';

export interface PolymarketV2RiskContext {
  readonly rawFreeBalanceUsd?: number;
  readonly currentMarketExposureUsd?: number;
  readonly tickSizeMicro?: number;
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

  const fallbackFreeMicro = Math.round((ctx.rawFreeBalanceUsd ?? 50_000) * MICRO_PER_PUSD);
  const rawFreeBalanceMicro = readNumMeta(meta, 'rawFreeBalanceMicro', fallbackFreeMicro);
  const fallbackExposureMicro = Math.round((ctx.currentMarketExposureUsd ?? 0) * MICRO_PER_PUSD);
  const currentMarketExposureMicro = readNumMeta(
    meta,
    'currentMarketExposureMicro',
    fallbackExposureMicro,
  );

  return {
    priceMicro,
    sharesMicro,
    tickSizeMicro,
    isLimitOrder,
    isMarketBuyFakOrFok,
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
    rawFreeBalanceMicro: signal.rawFreeBalanceMicro ?? fallbackFreeMicro,
    currentMarketExposureMicro: signal.currentMarketExposureMicro ?? fallbackExposureMicro,
    currentVpin: signal.currentVpin ?? ctx.currentVpin ?? 0,
    clusterCvar99Pct: signal.clusterCvar99Pct ?? ctx.clusterCvar99Pct ?? 0,
    consecutiveBookErrors: signal.consecutiveBookErrors ?? ctx.consecutiveBookErrors ?? 0,
  });
}
