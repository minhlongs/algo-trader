/**
 * Strategy 3 + Strategy 7 Integration Wiring.
 *
 * Bridges `LiquidityRegimeMachine` telemetry, `TRENDING` spread/size scaling,
 * resting-quote cancellation on `EVENT`/`REDUCE_ONLY`/`HALTED`, and matched
 * YES+NO `mergeEligible` (`>= 20 pUSD`) `eth_call` merge preflight dispatch.
 */

import type { GammaMarket } from '../../../polymarket/gamma-client';
import type { OrderManager } from '../../../polymarket/order-manager';
import { toMarketBytes32, type CtfEthCallPreflight } from '../../../polymarket/ctf-eth-call-preflight';
import { calcMakerRebatePerShare, type PolymarketFeeSchedule } from '../../../polymarket/polymarket-fee-calculator';
import type { LiquidityRegimeMachine } from '../../../polymarket/liquidity-regime-machine';
import type { LiquidityRegimeDecision, LiquidityRegimeObservation } from '../../../polymarket/liquidity-regime-types';
import type { OpenPosition } from '../base-polymarket-strategy';
import type { ExecutedLeg } from './toxicity-aware-market-maker-leg-executor';
import { roundToTick } from './toxicity-aware-market-maker-math';
import type { QuoteFill } from './toxicity-aware-market-maker-state';
import type {
  MakerRegimeTelemetry, MergeEligiblePair, MergeEligiblePairEvent, ToxicityAwareConfig,
} from './toxicity-aware-market-maker-types';

export type ExternalRegimeFeed = Partial<Omit<LiquidityRegimeObservation, 'marketId' | 'nowMs'>>;

interface PairInventoryRecord {
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  yesShares: number;
  noShares: number;
}

const ONE_MINUTE_MS = 60_000;

export function calcPairMakerRebatePusd(
  yesSched: PolymarketFeeSchedule, yesPrice: number,
  noSched: PolymarketFeeSchedule, noPrice: number, legNotional: number,
): number {
  const yesShares = yesPrice > 0 ? legNotional / yesPrice : 0;
  const noShares = noPrice > 0 ? legNotional / noPrice : 0;
  return calcMakerRebatePerShare(yesSched, yesPrice) * yesShares + calcMakerRebatePerShare(noSched, noPrice) * noShares;
}

export function widenBidForRegime(
  baseBid: number, mid: number, spreadMultiplier: number, quoteTicks: number, tickSize: number,
): number {
  if (!(baseBid > 0) || baseBid >= 1) return 0;
  if (!(spreadMultiplier > 1)) return baseBid;
  const fallbackHalf = Math.max(1, quoteTicks) * tickSize;
  const anchorMid = mid > baseBid ? mid : baseBid + fallbackHalf;
  const baseHalf = Math.max(fallbackHalf, anchorMid - baseBid);
  const widened = roundToTick(anchorMid - spreadMultiplier * baseHalf, tickSize);
  return widened > 0 && widened < 1 ? widened : 0;
}

export class MakerRegimeCoordinator {
  private readonly feedByMarket = new Map<string, ExternalRegimeFeed>();
  private readonly pairInventory = new Map<string, PairInventoryRecord>();
  private excludedFiveMinuteMarkets = 0;
  private mergePreflightFailures = 0;

  constructor(
    private readonly regime: LiquidityRegimeMachine,
    private readonly cfg: ToxicityAwareConfig,
    private readonly orderManager: OrderManager,
    private readonly ctfPreflight?: CtfEthCallPreflight,
    private readonly onMergePair?: (
      event: MergeEligiblePairEvent,
    ) => Promise<{ merged?: boolean } | void> | { merged?: boolean } | void,
  ) {}

  noteExcludedFiveMinuteMarket(): void { this.excludedFiveMinuteMarkets += 1; }

  updateObservation(marketId: string, obs: ExternalRegimeFeed): void {
    this.feedByMarket.set(marketId, { ...(this.feedByMarket.get(marketId) ?? {}), ...obs });
  }

  recordFilledLeg(leg: ExecutedLeg, yesTokenId: string, noTokenId: string): void {
    const rec = this.pairInventory.get(leg.conditionId) ?? {
      conditionId: leg.conditionId, yesTokenId, noTokenId, yesShares: 0, noShares: 0,
    };
    if (leg.side === 'yes') rec.yesShares += leg.quantity;
    else rec.noShares += leg.quantity;
    this.pairInventory.set(leg.conditionId, rec);
  }

  async evaluateMarketRegime(
    market: GammaMarket, nowMs: number, fills: ReadonlyArray<QuoteFill>, yesMid: number,
  ): Promise<LiquidityRegimeDecision> {
    const endMs = Date.parse(market.endDate);
    const timeToExpiryMs = Number.isFinite(endMs) ? Math.max(0, endMs - nowMs) : Number.POSITIVE_INFINITY;
    const recentFills = fills.filter((f) => nowMs - f.atMs <= ONE_MINUTE_MS).length;
    const inv = this.pairInventory.get(market.conditionId);
    const netSkewQ = inv ? (inv.yesShares - inv.noShares) / Math.max(1, this.cfg.skuCapShares) : 0;

    const obs: LiquidityRegimeObservation = {
      marketId: market.conditionId,
      nowMs,
      timeToExpiryMs,
      fillsPerMinute: recentFills,
      normalizedInventoryQ: netSkewQ,
      tickSize: this.cfg.tickSize,
      ...(yesMid > 0 ? { referencePrice: yesMid } : {}),
      ...(this.feedByMarket.get('*') ?? {}),
      ...(this.feedByMarket.get(market.conditionId) ?? {}),
    };

    const decision = await this.regime.evaluateAndEnforce(obs);
    if (decision.withdrawAllQuotes || decision.cancelMarketOrders) {
      await this.safeCancelTokenOrders(market.yesTokenId, nowMs);
      if (market.noTokenId) await this.safeCancelTokenOrders(market.noTokenId, nowMs);
    }
    return decision;
  }

  getMergeEligiblePairs(): MergeEligiblePair[] {
    const out: MergeEligiblePair[] = [];
    for (const rec of this.pairInventory.values()) {
      const matchedShares = Math.min(rec.yesShares, rec.noShares);
      if (matchedShares >= this.cfg.mergeThresholdPusd) {
        out.push({
          conditionId: rec.conditionId, yesTokenId: rec.yesTokenId, noTokenId: rec.noTokenId,
          matchedShares, mergeableCollateralPusd: matchedShares, mergeEligible: true,
        });
      }
    }
    return out;
  }

  async processEligibleMerges(positions: OpenPosition[]): Promise<void> {
    if (!this.onMergePair && !this.ctfPreflight) return;
    for (const pair of this.getMergeEligiblePairs()) {
      let preflight: MergeEligiblePairEvent['preflight'];
      if (this.ctfPreflight) {
        preflight = await this.ctfPreflight.simulateMergePositions({
          conditionId: toMarketBytes32(pair.conditionId),
          amountRaw: BigInt(Math.max(1, Math.round(pair.matchedShares * 1e6))),
        });
        if (!preflight.ok) { this.mergePreflightFailures += 1; continue; }
      }
      if (!this.onMergePair) continue;
      const res = await this.onMergePair({ ...pair, preflight });
      if (res && res.merged === false) continue;
      const rec = this.pairInventory.get(pair.conditionId);
      if (rec) {
        rec.yesShares = Math.max(0, rec.yesShares - pair.matchedShares);
        rec.noShares = Math.max(0, rec.noShares - pair.matchedShares);
      }
      deductMergedPositions(positions, pair.conditionId, pair.matchedShares);
    }
  }

  getTelemetry(nowMs = Date.now()): MakerRegimeTelemetry {
    return {
      regime: this.regime.getTelemetry(nowMs),
      mergeEligiblePairs: this.getMergeEligiblePairs(),
      excludedFiveMinuteMarkets: this.excludedFiveMinuteMarkets,
      mergePreflightFailures: this.mergePreflightFailures,
    };
  }

  private async safeCancelTokenOrders(tokenId: string, nowMs: number): Promise<void> {
    try { await this.orderManager.cancelAllOrders(tokenId); }
    catch { this.regime.recordApiError(nowMs); }
  }
}

function deductMergedPositions(positions: OpenPosition[], conditionId: string, shares: number): void {
  for (let i = positions.length - 1; i >= 0; i--) {
    const p = positions[i]!;
    if (p.conditionId !== conditionId) continue;
    const rem = p.tokenQuantity - shares;
    if (rem <= 1e-9) positions.splice(i, 1);
    else { p.sizeUsdc *= rem / p.tokenQuantity; p.tokenQuantity = rem; }
  }
}
