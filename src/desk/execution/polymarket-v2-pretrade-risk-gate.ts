/**
 * Polymarket CLOB V2 Pre-Trade Risk Gate (`POLY-ALPHA-HUNTER-V4` §13.3 & PATCH-06..12)
 *
 * Enforces 10 deterministic micro-unit pre-trade invariants before any order reaches
 * the CLOB V2 signer or paper execution simulator:
 *   1. Orderbook consecutive error circuit breaker (`consecutiveBookErrors < maxConsecutiveBookErrors`)
 *   2. VPIN toxicity kill-switch (`currentVpin <= maxVpinThreshold`, default 0.70)
 *   3. Tail-risk cluster CVaR gate (`clusterCvar99Pct <= maxClusterCvarPct`, default 3.5%)
 *   4. Extreme tail probability cutoffs (`[$0.02, $0.98]` = `[20_000, 980_000]` micro-units)
 *   5. Allowed CLOB V2 tick grid (`10_000 | 5_000 | 2_500 | 1_000`) & exact divisibility
 *   6. Minimum limit order size (`>= 5_000_000` micro-shares = 5 shares)
 *   7. Market order (buy or sell) 2-decimal collateral floor (`floorMarketBuyNotionalMicro`, #59/#99)
 *   8. 20% stale matched-order balance reserve (`effectiveFreeBalanceMicro`, #112/#36)
 *   9. Per-market exposure concentration cap (`marketExposureMicro <= maxMarketExposureMicro`)
 *  10. Two-sided liquidity reward depth rule (`computeEffectiveRewardDepthMicro`)
 */

import { MICRO_PER_PUSD } from './integer-micro-unit-fifo-ledger';
import { allOrderTermsFinite, failNonFiniteOrderTerms } from './polymarket-pretrade-finite-guard';

export type AllowedTickSizeMicro = 10_000 | 5_000 | 2_500 | 1_000;

export const ALLOWED_TICK_SIZES_MICRO: ReadonlySet<number> = new Set<AllowedTickSizeMicro>([
  10_000,
  5_000,
  2_500,
  1_000,
]);

export interface PreTradeRiskGateConfigV2 {
  maxVpinThreshold: number;
  maxClusterCvarPct: number;
  staleBalanceReservePct: number;
  minLimitOrderSharesMicro: number;
  extremeBidCutoffMicro: number;
  extremeAskCutoffMicro: number;
  maxConsecutiveBookErrors: number;
  maxMarketExposureMicro: number;
}

export const DEFAULT_PRETRADE_RISK_GATE_CONFIG_V2: PreTradeRiskGateConfigV2 = {
  maxVpinThreshold: 0.70,
  maxClusterCvarPct: 0.035,
  staleBalanceReservePct: 0.20,
  minLimitOrderSharesMicro: 5_000_000,
  extremeBidCutoffMicro: 20_000,
  extremeAskCutoffMicro: 980_000,
  maxConsecutiveBookErrors: 5,
  maxMarketExposureMicro: 7_500_000_000, // 7,500 pUSD (15% of 50k reference desk)
};

export type PreTradeRejectReasonV2 =
  | 'BOOK_ERROR_CIRCUIT_BREAKER'
  | 'VPIN_TOXICITY_EXCEEDED'
  | 'CLUSTER_CVAR_EXCEEDED'
  | 'PRICE_OUTSIDE_EXTREME_CUTOFFS'
  | 'INVALID_TICK_SIZE_GRID'
  | 'PRICE_NOT_ALIGNED_TO_TICK'
  | 'BELOW_MIN_LIMIT_SHARES'
  | 'MARKET_BUY_NOTIONAL_ZERO_AFTER_FLOOR'
  | 'INSUFFICIENT_RESERVED_BALANCE'
  | 'MARKET_EXPOSURE_CAP_EXCEEDED'
  | 'NON_FINITE_ORDER_TERMS';

export interface PreTradeOrderCandidateV2 {
  priceMicro: number;
  sharesMicro: number;
  tickSizeMicro: number;
  isLimitOrder: boolean;
  isMarketBuyFakOrFok?: boolean;
  rawFreeBalanceMicro: number;
  currentMarketExposureMicro?: number;
  currentVpin: number;
  clusterCvar99Pct: number;
  consecutiveBookErrors: number;
}

export interface PreTradeValidationResultV2 {
  allowed: boolean;
  reason?: PreTradeRejectReasonV2;
  effectiveFreeBalanceMicro: number;
  requiredNotionalMicro: number;
  sanitizedNotionalMicro: number;
}

/**
 * Truncate Market BUY (`FAK`/`FOK`) collateral amount down to 2 decimal places
 * (`10_000` micro-units = `$0.01`) to prevent CLOB V2 HTTP 400 precision errors (#59, #99).
 */
export function floorMarketBuyNotionalMicro(notionalMicro: number): number {
  if (notionalMicro <= 0) return 0;
  return Math.floor(notionalMicro / 10_000) * 10_000;
}

/**
 * Compute effective two-sided liquidity reward depth in micro-shares:
 * For `midMicro` in `[100_000, 900_000]` (`[0.10, 0.90]`), single-sided depth is
 * capped at `max(Q_bid, Q_ask) / 3`. Outside `[0.10, 0.90]`, strictly two-sided `min(Q_bid, Q_ask)`.
 */
export function computeEffectiveRewardDepthMicro(
  bidDepthMicro: number,
  askDepthMicro: number,
  midMicro: number,
): number {
  const qBid = Math.max(0, bidDepthMicro);
  const qAsk = Math.max(0, askDepthMicro);
  const minDepth = Math.min(qBid, qAsk);
  const maxDepth = Math.max(qBid, qAsk);
  if (midMicro >= 100_000 && midMicro <= 900_000) {
    return Math.max(minDepth, Math.floor(maxDepth / 3));
  }
  return minDepth;
}

export class PolymarketV2PreTradeRiskGate {
  private readonly cfg: PreTradeRiskGateConfigV2;

  constructor(config: Partial<PreTradeRiskGateConfigV2> = {}) {
    this.cfg = { ...DEFAULT_PRETRADE_RISK_GATE_CONFIG_V2, ...config };
  }

  getConfig(): Readonly<PreTradeRiskGateConfigV2> {
    return this.cfg;
  }

  validateOrder(candidate: PreTradeOrderCandidateV2): PreTradeValidationResultV2 {
    // Every numeric comparison below is a no-op against NaN, so NaN order terms
    // would otherwise sail through the whole gate as a valid, notional-less order.
    if (!allOrderTermsFinite(candidate)) {
      return failNonFiniteOrderTerms();
    }
    const reserveMultiplier = Math.max(0, 1 - this.cfg.staleBalanceReservePct);
    const effectiveFreeBalanceMicro = Math.floor(candidate.rawFreeBalanceMicro * reserveMultiplier);
    const rawNotionalMicro = Math.floor(
      (candidate.sharesMicro * candidate.priceMicro) / MICRO_PER_PUSD,
    );
    // Any market order settles against a pUSD collateral/proceeds amount, so the
    // 2-decimal collateral floor applies to it, not only to FAK/FOK market buys.
    const sanitizedNotionalMicro = candidate.isLimitOrder
      ? rawNotionalMicro
      : floorMarketBuyNotionalMicro(rawNotionalMicro);

    const fail = (reason: PreTradeRejectReasonV2): PreTradeValidationResultV2 => ({
      allowed: false,
      reason,
      effectiveFreeBalanceMicro,
      requiredNotionalMicro: rawNotionalMicro,
      sanitizedNotionalMicro,
    });

    if (candidate.consecutiveBookErrors >= this.cfg.maxConsecutiveBookErrors) {
      return fail('BOOK_ERROR_CIRCUIT_BREAKER');
    }
    if (candidate.currentVpin > this.cfg.maxVpinThreshold) {
      return fail('VPIN_TOXICITY_EXCEEDED');
    }
    if (candidate.clusterCvar99Pct > this.cfg.maxClusterCvarPct) {
      return fail('CLUSTER_CVAR_EXCEEDED');
    }
    if (
      candidate.priceMicro < this.cfg.extremeBidCutoffMicro
      || candidate.priceMicro > this.cfg.extremeAskCutoffMicro
    ) {
      return fail('PRICE_OUTSIDE_EXTREME_CUTOFFS');
    }
    if (!ALLOWED_TICK_SIZES_MICRO.has(candidate.tickSizeMicro)) {
      return fail('INVALID_TICK_SIZE_GRID');
    }
    if (candidate.priceMicro % candidate.tickSizeMicro !== 0) {
      return fail('PRICE_NOT_ALIGNED_TO_TICK');
    }
    if (candidate.isLimitOrder && candidate.sharesMicro < this.cfg.minLimitOrderSharesMicro) {
      return fail('BELOW_MIN_LIMIT_SHARES');
    }
    if (!candidate.isLimitOrder && sanitizedNotionalMicro <= 0) {
      return fail('MARKET_BUY_NOTIONAL_ZERO_AFTER_FLOOR');
    }
    if (sanitizedNotionalMicro > effectiveFreeBalanceMicro) {
      return fail('INSUFFICIENT_RESERVED_BALANCE');
    }
    const projectedExposureMicro =
      (candidate.currentMarketExposureMicro ?? 0) + sanitizedNotionalMicro;
    if (projectedExposureMicro > this.cfg.maxMarketExposureMicro) {
      return fail('MARKET_EXPOSURE_CAP_EXCEEDED');
    }

    return {
      allowed: true,
      effectiveFreeBalanceMicro,
      requiredNotionalMicro: rawNotionalMicro,
      sanitizedNotionalMicro,
    };
  }
}
