/**
 * Market Maker V2 — On-Chain OFI / VPIN Regime & Log-Odds Avellaneda-Stoikov Quoting
 * (`POLY-ALPHA-HUNTER-V4` §0.5, §3.3, §3.5)
 *
 * Bridges `RawOrderBook` snapshots and on-chain `OrderFilled` trade events into
 * 5-level Order Flow Imbalance (`OFI^(5)_t`), volume-synchronized VPIN toxicity,
 * 4-state regime classification (`state === 3` toxic kill switch at `VPIN > 0.70`),
 * and `LogOddsAvellanedaStoikovMarketMaker` quote generation.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import {
  LogOddsAvellanedaStoikovMarketMaker,
  type LogOddsAsConfig,
  type LogOddsAsQuotePair,
  type TickGridMicro,
} from '../../polymarket/log-odds-avellaneda-stoikov-mm';
import {
  VolumeSynchronizedVpinEstimator,
  computeFiveLevelOfiMicro,
  estimateRegimeFromOfiVpin,
  type OfiBookLevelDelta,
  type OnchainOrderFilledEvent,
  type RegimeEstimate,
} from '../../polymarket/onchain-ofi-vpin-estimator';
import { MICRO_PER_PUSD } from '../../execution/integer-micro-unit-fifo-ledger';
import {
  computeAskPrice,
  computeBidPrice,
  type MarketMakerConfig,
  type MmMarketState,
} from './market-maker-math';

export type {
  LogOddsAsConfig,
  LogOddsAsQuotePair,
  OfiBookLevelDelta,
  OnchainOrderFilledEvent,
  RegimeEstimate,
  TickGridMicro,
};
export { LogOddsAvellanedaStoikovMarketMaker, VolumeSynchronizedVpinEstimator };

export interface MarketMakerV2Telemetry {
  ofiSignedMicro: number;
  ofiNormalized: number;
  currentVpin: number;
  regime: RegimeEstimate;
  logOddsQuote?: LogOddsAsQuotePair;
}

/**
 * Derive 5-level order-book deltas (`OfiBookLevelDelta[]`) between a previous
 * `RawOrderBook` and the current `RawOrderBook`.
 */
export function computeBookOfiDeltas(
  currentBook: RawOrderBook,
  prevBook?: RawOrderBook,
): OfiBookLevelDelta[] {
  const deltas: OfiBookLevelDelta[] = [];
  for (let i = 0; i < 5; i++) {
    const curBid = currentBook.bids[i];
    const curAsk = currentBook.asks[i];
    if (!curBid && !curAsk) break;

    const curBidSizeMicro = Math.round(parseFloat(curBid?.size ?? '0') * MICRO_PER_PUSD);
    const curAskSizeMicro = Math.round(parseFloat(curAsk?.size ?? '0') * MICRO_PER_PUSD);
    const curBidPriceMicro = Math.round(parseFloat(curBid?.price ?? '0.5') * MICRO_PER_PUSD);
    const curAskPriceMicro = Math.round(parseFloat(curAsk?.price ?? '0.5') * MICRO_PER_PUSD);
    const levelMidMicro = Math.round((curBidPriceMicro + curAskPriceMicro) / 2);

    if (!prevBook) {
      deltas.push({ priceMicro: levelMidMicro, bidDeltaMicro: 0, askDeltaMicro: 0 });
      continue;
    }
    const prevBidSizeMicro = Math.round(parseFloat(prevBook.bids[i]?.size ?? '0') * MICRO_PER_PUSD);
    const prevAskSizeMicro = Math.round(parseFloat(prevBook.asks[i]?.size ?? '0') * MICRO_PER_PUSD);
    deltas.push({
      priceMicro: levelMidMicro,
      bidDeltaMicro: curBidSizeMicro - prevBidSizeMicro,
      askDeltaMicro: curAskSizeMicro - prevAskSizeMicro,
    });
  }
  return deltas;
}

/** Evaluate 5-level OFI, rolling VPIN, and 4-state market regime for a market tick. */
export function evaluateMarketMakerV2Regime(params: {
  currentBook: RawOrderBook;
  prevBook?: RawOrderBook;
  vpinEstimator: VolumeSynchronizedVpinEstimator;
  vpinOverride?: number;
  killSwitchThreshold?: number;
  midProbability: number;
}): { ofiSignedMicro: number; ofiNormalized: number; currentVpin: number; regime: RegimeEstimate } {
  const deltas = computeBookOfiDeltas(params.currentBook, params.prevBook);
  const ofi = computeFiveLevelOfiMicro(deltas);
  const currentVpin = params.vpinOverride ?? params.vpinEstimator.rollingVpin();
  const regime = estimateRegimeFromOfiVpin(
    ofi.ofiNormalized,
    currentVpin,
    params.killSwitchThreshold ?? 0.70,
    params.midProbability,
  );
  return { ofiSignedMicro: ofi.ofiSignedMicro, ofiNormalized: ofi.ofiNormalized, currentVpin, regime };
}

/** Compute bid/ask quote pair using `LogOddsAvellanedaStoikovMarketMaker`. */
export function computeLogOddsMakerQuotes(params: {
  mmEngine: LogOddsAvellanedaStoikovMarketMaker;
  fairValue: number;
  inventorySkew: number;
  quoteSizeUsdc: number;
  ofiNormalized: number;
  currentVpin: number;
  yangZhangVarianceDaily?: number;
}): LogOddsAsQuotePair {
  const safeMid = Math.max(0.02, Math.min(0.98, params.fairValue));
  const inventoryShares = params.inventorySkew * (params.quoteSizeUsdc / safeMid);
  return params.mmEngine.quotePair({
    midProbability: safeMid,
    yangZhangVarianceDaily: params.yangZhangVarianceDaily ?? 0.04,
    inventoryShares,
    ofiNormalized: params.ofiNormalized,
    currentVpin: params.currentVpin,
  });
}

/** Evaluate regime and resolve active bid/ask quotes for a market tick. */
export function resolveTickQuotesWithRegime(params: {
  state: MmMarketState;
  book: RawOrderBook;
  midPrice: number;
  cfg: MarketMakerConfig;
  mmEngine: LogOddsAvellanedaStoikovMarketMaker;
}): { halted: true; telemetry: MarketMakerV2Telemetry } | { halted: false; bid: number; ask: number; telemetry: MarketMakerV2Telemetry } {
  const vpinEstimator =
    params.state.vpinEstimator ??
    new VolumeSynchronizedVpinEstimator(
      params.cfg.vpinBucketVolumeMicro ?? 100_000_000,
      params.cfg.vpinRollingWindowBuckets ?? 50,
    );
  params.state.vpinEstimator = vpinEstimator;

  const regimeEval = evaluateMarketMakerV2Regime({
    currentBook: params.book,
    prevBook: params.state.prevBook,
    vpinEstimator,
    vpinOverride: params.state.vpinOverride,
    killSwitchThreshold: params.cfg.vpinKillSwitchThreshold ?? 0.70,
    midProbability: params.midPrice > 0 && params.midPrice < 1 ? params.midPrice : params.state.fairValue,
  });
  params.state.prevBook = params.book;

  if (regimeEval.regime.isToxicKillSwitchTriggered) {
    params.state.haltedByToxicRegime = true;
    const telemetry: MarketMakerV2Telemetry = { ...regimeEval };
    params.state.v2Telemetry = telemetry;
    return { halted: true, telemetry };
  }

  params.state.haltedByToxicRegime = false;
  if (params.cfg.useLogOddsAsQuoting) {
    const logOddsQuote = computeLogOddsMakerQuotes({
      mmEngine: params.mmEngine,
      fairValue: params.state.fairValue,
      inventorySkew: params.state.inventorySkew,
      quoteSizeUsdc: params.cfg.quoteSizeUsdc,
      ofiNormalized: regimeEval.ofiNormalized,
      currentVpin: regimeEval.currentVpin,
      yangZhangVarianceDaily: params.cfg.yangZhangVarianceDaily,
    });
    const telemetry: MarketMakerV2Telemetry = { ...regimeEval, logOddsQuote };
    params.state.v2Telemetry = telemetry;
    return {
      halted: false,
      bid: logOddsQuote.bidProbability,
      ask: logOddsQuote.askProbability,
      telemetry,
    };
  }

  const bid = computeBidPrice(params.state.fairValue, params.cfg.baseSpread, params.state.inventorySkew, params.cfg.skewSpreadMultiplier);
  const ask = computeAskPrice(params.state.fairValue, params.cfg.baseSpread, params.state.inventorySkew, params.cfg.skewSpreadMultiplier);
  const telemetry: MarketMakerV2Telemetry = { ...regimeEval };
  params.state.v2Telemetry = telemetry;
  return { halted: false, bid, ask, telemetry };
}
