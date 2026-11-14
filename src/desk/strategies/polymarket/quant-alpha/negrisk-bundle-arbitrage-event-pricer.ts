/**
 * Prices one Gamma event as a buy-N-of-N bundle.
 *
 * Every price in the returned quote comes from a real ask book — a leg whose
 * ask side is empty ends the quote, because a bundle is only worth what can
 * actually be crossed. Fees come from `resolveStrategyFeeSchedule`, i.e. from
 * the market the venue publishes, never from a category keyword.
 *
 * The implication graph fed to the projection is injected rather than inferred.
 * The report assumes an offline-verified dependency graph with a mutex against
 * bad inference; absent one, `noImplications` is the plain simplex, which is
 * the safe degenerate case — it can only make the projection stricter, never
 * let an inconsistent event through.
 */

import type { ClobClient } from '../../../polymarket/clob-client';
import type { GammaEvent } from '../../../polymarket/gamma-client';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';
import {
  calcMakerFeeRate,
  calcTakerFeePerShare,
} from '../../../polymarket/polymarket-fee-calculator';
import { resolveStrategyFeeSchedule } from './quant-alpha-fee-schedule';
import type {
  BundleLeg,
  BundleProjection,
  BundleQuote,
  NegRiskBundleConfig,
} from './negrisk-bundle-arbitrage-types';
import {
  bestAskPrice,
  bundleNetEdge,
  frankWolfeProjection,
  makerOptimisationApplies,
  sizeAtLevel,
  totalAskCost,
  type ImplicationEdge,
} from './negrisk-bundle-arbitrage-math';

/** The implication graph decides the projection's feasible set. */
export type ImplicationGraphFn = (event: GammaEvent) => ImplicationEdge[];

/** No verified dependency graph available — project onto the plain simplex. */
export const noImplications: ImplicationGraphFn = () => [];

export interface EventPricingOptions {
  clob: ClobClient;
  feeResolver: FeeScheduleResolver | undefined;
  strategyName: string;
  config: NegRiskBundleConfig;
  implications: ImplicationGraphFn;
}

export interface PricedEvent {
  quote: BundleQuote;
  projection: BundleProjection;
}

/** Markets of one event that can be bundled at all. */
export function bundleableMarkets(event: GammaEvent): GammaEvent['markets'] {
  return event.markets.filter(
    (market) => market.negRisk === true && !market.closed && market.resolved !== true,
  );
}

/**
 * Quote one event, or return null when it cannot be priced honestly.
 *
 * Returns null for: too few or too many outcomes, an empty ask side on any
 * leg, an unknown fee schedule on any leg, a bundle that costs too much, too
 * little edge, or (when required) a projection that did not converge.
 */
export async function priceEvent(
  event: GammaEvent,
  options: EventPricingOptions,
): Promise<PricedEvent | null> {
  const { config } = options;
  const markets = bundleableMarkets(event);
  if (markets.length < config.minEventOutcomeCount) return null;
  if (markets.length > config.maxEventOutcomeCount) return null;

  const legs: BundleLeg[] = [];
  let takerFeePusd = 0;
  let feeRateMax = 0;

  for (const market of markets) {
    const leg = await priceLeg(market.yesTokenId, market.conditionId, market.groupItemTitle ?? '', options);
    if (!leg) return null;
    legs.push(leg);

    const schedule = await resolveStrategyFeeSchedule(
      options.feeResolver,
      leg.tokenId,
      options.strategyName,
    );
    // Unknown cost is not a cost of zero: refuse the whole event.
    if (!schedule) return null;
    feeRateMax = Math.max(feeRateMax, schedule.rate);
    // Aggressive legs pay taker fee; thin maker legs earn maker rebate on
    // takerOnly schedules or pay schedule rate when takerOnly is false.
    if (leg.displayedShares >= config.thinLegMaxDisplayedShares) {
      takerFeePusd += calcTakerFeePerShare(schedule, leg.askPrice);
    } else {
      takerFeePusd += schedule.takerOnly
        ? calcMakerFeeRate(schedule, leg.askPrice) * leg.askPrice
        : calcTakerFeePerShare(schedule, leg.askPrice);
    }
  }

  const totalCostPusd = totalAskCost(legs);
  if (!(totalCostPusd <= config.maxBundleCostPusd)) return null;

  const netEdgePusd = bundleNetEdge(totalCostPusd, takerFeePusd, config.conversionVaultFeePusd);
  if (!(netEdgePusd >= config.minEdgePusd)) return null;

  const projection = frankWolfeProjection(
    markets.map((market) => clampProbability(market.yesPrice)),
    options.implications(event),
    {
      maxIterations: config.solverMaxIterations,
      tolerance: config.solverTolerance,
      timeBudgetMs: config.solverTimeBudgetMs,
    },
  );
  if (config.fwRequireConverged && !projection.converged) return null;

  return {
    quote: {
      eventId: event.id,
      eventTitle: event.title,
      legs,
      totalCostPusd,
      takerFeePusd,
      netEdgePusd,
      makerOptimisationApplies: makerOptimisationApplies(
        feeRateMax,
        config.makerOptimisedFeeRateMin,
        config.makerOptimisedFeeRateMax,
      ),
    },
    projection: {
      probabilities: projection.probabilities,
      converged: projection.converged,
      iterations: projection.iterations,
      elapsedMs: projection.elapsedMs,
    },
  };
}

/** One leg, priced off its own book. Null when nothing is offered to buy. */
async function priceLeg(
  tokenId: string,
  conditionId: string,
  outcome: string,
  options: EventPricingOptions,
): Promise<BundleLeg | null> {
  const book = await options.clob.getOrderBook(tokenId);
  const askPrice = bestAskPrice(book.asks, options.config.tickSize);
  if (!(askPrice > 0)) return null;
  const displayedShares = sizeAtLevel(book.asks, askPrice);
  if (!(displayedShares > 0)) return null;
  return { tokenId, conditionId, outcome, askPrice, displayedShares };
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}
