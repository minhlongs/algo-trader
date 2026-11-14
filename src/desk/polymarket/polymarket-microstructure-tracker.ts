/**
 * Per-Token Orderbook Microstructure Tracker & Orchestrator Settlement Helpers
 *
 * Tracks 5-level Order Flow Imbalance (`computeFiveLevelOfiMicro`), rolling
 * volume-synchronized VPIN (`VolumeSynchronizedVpinEstimator`), 4-state market
 * regime (`estimateRegimeFromOfiVpin`), and `consecutiveBookErrors` per `tokenId`
 * for `LiveTradingOrchestrator` and `PolymarketV2PreTradeRiskGate`.
 */

import { MICRO_PER_PUSD, type UnrealizedMtmResult } from '../execution/integer-micro-unit-fifo-ledger';
import type { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import type { LivePositionTracker } from '../execution/live-position-tracker';
import type { LiveTradingJournal } from '../execution/live-trading-journal';
import type { PaperLegDecayTracker } from './paper-orderbook-simulator';
import { saveReconcilerState, appendG2ShadowTelemetry } from './g2-shadow-telemetry';
import {
  computeFiveLevelOfiMicro,
  estimateRegimeFromOfiVpin,
  VolumeSynchronizedVpinEstimator,
  type OfiBookLevelDelta,
  type OfiSnapshotResult,
  type OnchainOrderFilledEvent,
  type RegimeEstimate,
} from './onchain-ofi-vpin-estimator';

export interface RawBookLevelInput { price: string | number; size: string | number; }
export interface RawOrderBookSnapshotInput { bids: RawBookLevelInput[]; asks: RawBookLevelInput[]; }

export interface TokenMicrostructureTelemetry {
  tokenId: string;
  ofi: OfiSnapshotResult;
  currentVpin: number;
  regime: RegimeEstimate;
  consecutiveBookErrors: number;
  midProbability: number;
}

interface MicroBookLevel { priceMicro: number; sizeMicro: number; }
interface TokenMicroState {
  prevBids: MicroBookLevel[]; prevAsks: MicroBookLevel[]; hasSnapshot: boolean;
  lastOfi: OfiSnapshotResult; vpinEstimator: VolumeSynchronizedVpinEstimator;
  consecutiveBookErrors: number; midProbability: number;
}

const EMPTY_OFI: OfiSnapshotResult = {
  levelComputations: [], totalOfiLevelsActive: 0, ofiSignedMicro: 0, ofiNormalized: 0,
};

function parseLevels(levels: RawBookLevelInput[], descending: boolean): MicroBookLevel[] {
  const parsed = levels
    .map((l) => ({ priceMicro: Math.round(Number(l.price) * MICRO_PER_PUSD), sizeMicro: Math.round(Number(l.size) * MICRO_PER_PUSD) }))
    .filter((l) => Number.isFinite(l.priceMicro) && Number.isFinite(l.sizeMicro) && l.priceMicro > 0 && l.sizeMicro >= 0);
  parsed.sort((a, b) => (descending ? b.priceMicro - a.priceMicro : a.priceMicro - b.priceMicro));
  return parsed.slice(0, 5);
}

function computeLevelDelta(prev: MicroBookLevel | undefined, cur: MicroBookLevel | undefined, isBid: boolean): number {
  if (!prev && !cur) return 0;
  if (!prev && cur) return cur.sizeMicro;
  if (prev && !cur) return -prev.sizeMicro;
  const improved = isBid ? cur!.priceMicro > prev!.priceMicro : cur!.priceMicro < prev!.priceMicro;
  const worsened = isBid ? cur!.priceMicro < prev!.priceMicro : cur!.priceMicro > prev!.priceMicro;
  if (improved) return cur!.sizeMicro;
  if (worsened) return -prev!.sizeMicro;
  return cur!.sizeMicro - prev!.sizeMicro;
}

export class PolymarketMicrostructureTracker {
  private readonly tokens = new Map<string, TokenMicroState>();

  constructor(
    private readonly targetBucketVolumeMicro = 500 * MICRO_PER_PUSD,
    private readonly killSwitchThreshold = 0.70,
  ) {}

  private getOrCreate(tokenId: string): TokenMicroState {
    let st = this.tokens.get(tokenId);
    if (!st) {
      st = {
        prevBids: [], prevAsks: [], hasSnapshot: false, lastOfi: EMPTY_OFI,
        vpinEstimator: new VolumeSynchronizedVpinEstimator(this.targetBucketVolumeMicro),
        consecutiveBookErrors: 0, midProbability: 0.50,
      };
      this.tokens.set(tokenId, st);
    }
    return st;
  }

  recordOrderBookSnapshot(tokenId: string, book: RawOrderBookSnapshotInput): OfiSnapshotResult {
    const st = this.getOrCreate(tokenId);
    st.consecutiveBookErrors = 0;
    const bids = parseLevels(book.bids ?? [], true);
    const asks = parseLevels(book.asks ?? [], false);
    if (bids[0] && asks[0]) st.midProbability = (bids[0].priceMicro + asks[0].priceMicro) / (2 * MICRO_PER_PUSD);
    if (st.hasSnapshot) {
      const deltas: OfiBookLevelDelta[] = [];
      for (let i = 0; i < 5; i++) {
        const bid = bids[i] ?? st.prevBids[i];
        const ask = asks[i] ?? st.prevAsks[i];
        if (!bid && !ask) continue;
        deltas.push({
          priceMicro: bid?.priceMicro ?? ask?.priceMicro ?? 500_000,
          bidDeltaMicro: computeLevelDelta(st.prevBids[i], bids[i], true),
          askDeltaMicro: computeLevelDelta(st.prevAsks[i], asks[i], false),
        });
      }
      st.lastOfi = computeFiveLevelOfiMicro(deltas);
    }
    st.prevBids = bids;
    st.prevAsks = asks;
    st.hasSnapshot = true;
    return st.lastOfi;
  }

  recordTradePrint(
    tokenId: string,
    event: Pick<OnchainOrderFilledEvent, 'makerAssetId' | 'sharesMicro' | 'notionalUsdMicro'>,
  ): number {
    const st = this.getOrCreate(tokenId);
    st.vpinEstimator.addTrade(event);
    return st.vpinEstimator.rollingVpin();
  }

  recordBookError(tokenId: string): number {
    const st = this.getOrCreate(tokenId);
    st.consecutiveBookErrors += 1;
    return st.consecutiveBookErrors;
  }

  getTelemetry(tokenId: string): TokenMicrostructureTelemetry {
    const st = this.getOrCreate(tokenId);
    const currentVpin = st.vpinEstimator.rollingVpin();
    return {
      tokenId, ofi: st.lastOfi, currentVpin,
      regime: estimateRegimeFromOfiVpin(st.lastOfi.ofiNormalized, currentVpin, this.killSwitchThreshold, st.midProbability),
      consecutiveBookErrors: st.consecutiveBookErrors, midProbability: st.midProbability,
    };
  }

  getRiskContext(tokenId: string): { currentVpin: number; consecutiveBookErrors: number } {
    const st = this.tokens.get(tokenId);
    if (!st) return { currentVpin: 0, consecutiveBookErrors: 0 };
    return { currentVpin: st.vpinEstimator.rollingVpin(), consecutiveBookErrors: st.consecutiveBookErrors };
  }
}

export function executeOrchestratorMarketRedemption(params: {
  reconciler: PolymarketOrderReconciler; positionTracker: LivePositionTracker;
  journal: LiveTradingJournal; legDecayTracker: PaperLegDecayTracker;
  startedAtMs: number; mode: 'PAPER' | 'LIVE'; marketId?: string; tokenId: string; payoutPerShareUsdc: 0 | 1;
}): { settledShares: number; payoutUsdc: number; settledRedemptionPnlMicro: number; settledRedemptionPnlUsdc: number } {
  const res = params.reconciler.settleMarketRedemption({
    marketId: params.marketId, tokenId: params.tokenId, payoutPerShareUsdc: params.payoutPerShareUsdc,
  });
  const openPos = params.positionTracker.getPosition(params.tokenId);
  if (openPos && openPos.size > 0) {
    params.positionTracker.recordFill({
      orderId: `redemption-${params.tokenId}-${Date.now()}`,
      tokenId: params.tokenId, side: openPos.side === 'BUY' ? 'SELL' : 'BUY',
      size: openPos.size, price: params.payoutPerShareUsdc, filledAt: Date.now(),
    });
  }
  params.journal.recordEvent('market_redemption', {
    tokenId: params.tokenId.slice(0, 12), marketId: params.marketId,
    settledShares: res.settledShares, payoutUsdc: res.payoutUsdc,
    settledRedemptionPnlUsdc: res.settledRedemptionPnlUsdc, settledRedemptionPnlMicro: res.settledRedemptionPnlMicro,
  });
  if (params.mode === 'PAPER' && res.settledShares > 0) {
    const loopStartedAt = params.startedAtMs > 0 ? params.startedAtMs : Date.now();
    saveReconcilerState(params.reconciler, loopStartedAt, params.legDecayTracker.getStats());
    appendG2ShadowTelemetry({
      loopStartedAtMs: loopStartedAt, mode: 'PAPER', event: 'fill',
      positionSummary: params.positionTracker.getSummary(),
      reconciliationSummary: params.reconciler.reconcile(),
      leg2DecayStats: params.legDecayTracker.getStats(),
    });
  }
  return res;
}

export type { UnrealizedMtmResult };
