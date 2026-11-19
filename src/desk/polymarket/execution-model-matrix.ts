/**
 * Polymarket Execution Model Matrix.
 *
 * Separates the four execution/simulation harnesses so product smoke harnesses
 * cannot emit maker-only KPIs and quant validation harnesses enforce venue
 * microstructure invariants.
 */

import { DEFAULT_POSTERIOR_CONFIG } from './market-blind/market-blind-types';
import {
  CANCEL_LATENCY_MEDIAN_MS,
  CANCEL_LATENCY_P99_MS,
  CANCEL_VOLUME_FRACTION_MAX,
  CANCEL_VOLUME_FRACTION_MIN,
} from './queue-aware-fill-simulator';

export type ExecutionModelKind =
  | 'TAKER_HARNESS_PAPER_BETA'
  | 'MAKER_ONLY_QUEUE_CONSERVATIVE'
  | 'NEGRISK_MULTI_LEG'
  | 'MARKET_BLIND_NEWS';

export interface ExecutionModelSpec {
  readonly kind: ExecutionModelKind;
  readonly purpose: string;
  readonly orderType: 'TAKER_CROSS_SPREAD' | 'MAKER_POST_ONLY' | 'PASSIVE_FIRST_THEN_FAK' | 'SEALED_POSTERIOR_GATED';
  readonly postOnlyRequired: boolean;
  readonly queueBehindRestingDepthPct: number;
  readonly cancelAttributionBand: readonly [number, number] | null;
  readonly cancelLatencyMs: { readonly median: number; readonly p99: number } | null;
  readonly modelsStaleQuoteFillDuringCancelFlight: boolean;
  readonly zeroLookaheadEnforced: boolean;
  readonly rejectsFiveMinCrypto: boolean;
  readonly multiLegPolicy: {
    readonly thinLegMode: 'passive_first';
    readonly thickLegMode: 'sequential_failfast_fak';
    readonly modelsStrandedLegUnwindCost: boolean;
    readonly requiresEthCallPreflight: boolean;
    readonly modelsUmaDisputeLockup: boolean;
  } | null;
  readonly marketBlindPolicy: {
    readonly requiresSealedBlindPRawBeforeMarketRead: boolean;
    readonly minOosResolvedForecasts: number;
    readonly requiredGateCount: number;
    readonly failClosedWSkillZero: boolean;
  } | null;
  readonly allowedMetrics: readonly string[];
  readonly forbiddenMetrics: readonly string[];
}

export const EXECUTION_MODEL_MATRIX: Readonly<Record<ExecutionModelKind, ExecutionModelSpec>> = Object.freeze({
  TAKER_HARNESS_PAPER_BETA: Object.freeze({
    kind: 'TAKER_HARNESS_PAPER_BETA',
    purpose: 'Product smoke test harness crossing the spread; never valid for maker alpha claims',
    orderType: 'TAKER_CROSS_SPREAD',
    postOnlyRequired: false,
    queueBehindRestingDepthPct: 0,
    cancelAttributionBand: null,
    cancelLatencyMs: null,
    modelsStaleQuoteFillDuringCancelFlight: false,
    zeroLookaheadEnforced: true,
    rejectsFiveMinCrypto: false,
    multiLegPolicy: null,
    marketBlindPolicy: null,
    allowedMetrics: Object.freeze(['smoke_fill_count', 'taker_slippage_bps', 'taker_fee_usdc', 'paper_realized_pnl_usdc']),
    forbiddenMetrics: Object.freeze(['maker_markout_bps', 'maker_queue_fill_rate']),
  }),

  MAKER_ONLY_QUEUE_CONSERVATIVE: Object.freeze({
    kind: 'MAKER_ONLY_QUEUE_CONSERVATIVE',
    purpose: 'Conservative post-only maker simulator with full resting-depth queue, cancel latency, and stale-fill risk',
    orderType: 'MAKER_POST_ONLY',
    postOnlyRequired: true,
    queueBehindRestingDepthPct: 100,
    cancelAttributionBand: Object.freeze([CANCEL_VOLUME_FRACTION_MIN, CANCEL_VOLUME_FRACTION_MAX] as const),
    cancelLatencyMs: Object.freeze({ median: CANCEL_LATENCY_MEDIAN_MS, p99: CANCEL_LATENCY_P99_MS }),
    modelsStaleQuoteFillDuringCancelFlight: true,
    zeroLookaheadEnforced: true,
    rejectsFiveMinCrypto: true,
    multiLegPolicy: null,
    marketBlindPolicy: null,
    allowedMetrics: Object.freeze([
      'maker_markout_bps', 'maker_queue_fill_rate', 'stale_quote_adverse_selection_bps',
      'maker_rebate_usdc', 'net_maker_pnl_usdc',
    ]),
    forbiddenMetrics: Object.freeze(['five_min_crypto_maker_pnl_usdc']),
  }),

  NEGRISK_MULTI_LEG: Object.freeze({
    kind: 'NEGRISK_MULTI_LEG',
    purpose: 'NegRisk multi-outcome arb: passive-first thin leg, sequential fail-fast FAK thick leg, on-chain preflight',
    orderType: 'PASSIVE_FIRST_THEN_FAK',
    postOnlyRequired: false,
    queueBehindRestingDepthPct: 100,
    cancelAttributionBand: Object.freeze([CANCEL_VOLUME_FRACTION_MIN, CANCEL_VOLUME_FRACTION_MAX] as const),
    cancelLatencyMs: Object.freeze({ median: CANCEL_LATENCY_MEDIAN_MS, p99: CANCEL_LATENCY_P99_MS }),
    modelsStaleQuoteFillDuringCancelFlight: true,
    zeroLookaheadEnforced: true,
    rejectsFiveMinCrypto: true,
    multiLegPolicy: Object.freeze({
      thinLegMode: 'passive_first',
      thickLegMode: 'sequential_failfast_fak',
      modelsStrandedLegUnwindCost: true,
      requiresEthCallPreflight: true,
      modelsUmaDisputeLockup: true,
    }),
    marketBlindPolicy: null,
    allowedMetrics: Object.freeze([
      'negrisk_bundle_edge_bps', 'stranded_leg_unwind_cost_usdc',
      'uma_lockup_carry_cost_usdc', 'eth_call_preflight_pass_rate', 'net_negrisk_pnl_usdc',
    ]),
    forbiddenMetrics: Object.freeze(['zero_leg_risk_instant_arb_pnl_usdc']),
  }),

  MARKET_BLIND_NEWS: Object.freeze({
    kind: 'MARKET_BLIND_NEWS',
    purpose: 'Prospective market-blind forecasting with sealed p_raw prior to market read and 5-gate OOS skill unlock',
    orderType: 'SEALED_POSTERIOR_GATED',
    postOnlyRequired: false,
    queueBehindRestingDepthPct: 100,
    cancelAttributionBand: null,
    cancelLatencyMs: null,
    modelsStaleQuoteFillDuringCancelFlight: false,
    zeroLookaheadEnforced: true,
    rejectsFiveMinCrypto: true,
    multiLegPolicy: null,
    marketBlindPolicy: Object.freeze({
      requiresSealedBlindPRawBeforeMarketRead: true,
      minOosResolvedForecasts: DEFAULT_POSTERIOR_CONFIG.minResolvedQuestions,
      requiredGateCount: 5,
      failClosedWSkillZero: true,
    }),
    allowedMetrics: Object.freeze(['brier_score_model', 'brier_score_market', 'bss_oos', 'bss_lower_95', 'ece_10bin', 'w_skill']),
    forbiddenMetrics: Object.freeze(['retrospective_hindcast_bss', 'unsealed_post_market_p_raw']),
  }),
});

/** Throws if `metricName` is explicitly forbidden under `modelKind`. */
export function assertExecutionModelMetricAllowed(modelKind: ExecutionModelKind, metricName: string): void {
  const spec = EXECUTION_MODEL_MATRIX[modelKind];
  const normalized = metricName.trim();
  if (spec.forbiddenMetrics.includes(normalized)) {
    throw new Error(`Metric "${normalized}" is FORBIDDEN for execution model ${modelKind}: ${spec.purpose}`);
  }
}
