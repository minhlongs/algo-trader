/**
 * Live Trading Pipeline Helpers
 * Extracted subscription, arbitrage order relay, and error normalization helpers.
 */

import type { MultiVenueMarketStreamer } from '../data/multi-venue-market-streamer';
import type { CrossVenueArbOpportunity } from '../arbitrage/connectors/cross-venue-arb-detector';
import type { PolymarketRelayerEngine, RelayerOrderResponse } from '../polymarket/polymarket-relayer-engine';
import type { LiveTradingPipelineConfig } from './live-trading-pipeline-types';
import type { LiveTradingPipelineState } from './live-trading-pipeline-state';

export function toPipelineError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export function subscribeTrackedVenues(
  streamer: MultiVenueMarketStreamer,
  config: LiveTradingPipelineConfig,
): void {
  if (!config.trackedVenues || !config.trackedSymbols) return;
  for (const venue of config.trackedVenues) {
    for (const symbol of config.trackedSymbols) {
      streamer.subscribe(venue, symbol);
    }
  }
}

export function shouldAutoExecutePolymarketArb(
  opp: CrossVenueArbOpportunity,
  config: LiveTradingPipelineConfig,
  relayer?: PolymarketRelayerEngine,
): boolean {
  return Boolean(
    opp.isViable &&
      config.autoExecuteArb &&
      relayer &&
      (opp.buyVenue === 'polymarket' || opp.sellVenue === 'polymarket'),
  );
}

export async function submitPolymarketArbOrder(
  relayer: PolymarketRelayerEngine,
  opp: CrossVenueArbOpportunity,
  state: LiveTradingPipelineState,
): Promise<RelayerOrderResponse> {
  const side = opp.buyVenue === 'polymarket' ? 'BUY' : 'SELL';
  const price = opp.buyVenue === 'polymarket' ? opp.buyPrice : opp.sellPrice;
  const signed = await relayer.buildAndSignOrder({
    tokenId: opp.symbol,
    price,
    size: opp.maxVolume,
    side,
  });
  const res = await relayer.submitRelayerOrder(signed);
  if (res.status !== 'FAILED') state.successfulOrders++;
  else state.failedOrders++;
  return res;
}
