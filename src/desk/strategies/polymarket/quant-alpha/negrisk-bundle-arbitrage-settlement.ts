/**
 * Event-level NegRisk Bundle Arbitrage — Settlement & `eth_call` Preflight Gate.
 *
 * Verifies `NegRiskCtfCollateralAdapter.convertPositions` via `CtfEthCallPreflight`
 * before booking bundle conversions on `BundleBook` / `OrderManager`, failing closed
 * on any bitmask mismatch or `eth_call` revert.
 */

import type { GammaEvent } from '../../../polymarket/gamma-client';
import type { OrderManager } from '../../../polymarket/order-manager';
import {
  toMarketBytes32,
  type CtfEthCallPreflight,
} from '../../../polymarket/ctf-eth-call-preflight';
import { logger } from '../../../core/logger';
import type { OpenPosition, TradeEvent } from '../base-polymarket-strategy';
import type { BundleBook, BundleFill } from './negrisk-bundle-arbitrage-state';
import type { NegRiskBundleConfig } from './negrisk-bundle-arbitrage-types';
import type { StrategyName } from '../../../core/types';

export interface BundlePreflightStats {
  preflightPassed: number;
  preflightBlocked: number;
  excludedFiveMinuteEvents: number;
}

export interface SettleBundleParams {
  eventId: string;
  nowMs: number;
  book: BundleBook;
  cfg: NegRiskBundleConfig;
  orderManager: OrderManager;
  strategyName: StrategyName;
  positions: OpenPosition[];
  emitTrade: (trade: TradeEvent) => void;
  ctfPreflight?: CtfEthCallPreflight;
  stats: BundlePreflightStats;
}

/** Total volume carried across all markets of one Gamma event. */
export function eventVolume(event: GammaEvent): number {
  let total = 0;
  for (const market of event.markets) total += market.volume ?? 0;
  return total;
}

/** Emits fills, verifies `eth_call` preflight when configured, settles complete baskets, and tracks residuals. */
export async function settleOrRecordBundle(params: SettleBundleParams): Promise<void> {
  const { eventId, nowMs, book, cfg, orderManager, strategyName, positions, emitTrade, ctfPreflight, stats } = params;
  const fills = book.filledLegs(eventId);
  for (const fill of fills) emitBundleFill(fill, strategyName, emitTrade);

  if (book.isComplete(eventId)) {
    const qty = book.convertibleQuantity(eventId);
    if (qty > 0 && ctfPreflight) {
      const outcomeCount = fills.length;
      const heldNoSlots = Array.from({ length: outcomeCount }, (_, idx) => idx);
      const indexSet = (1n << BigInt(outcomeCount)) - 1n;
      const amountRaw = BigInt(Math.max(1, Math.round(qty * 1e6)));
      const sim = await ctfPreflight.simulateConvertPositions({
        marketId: toMarketBytes32(eventId),
        indexSet,
        amountRaw,
        outcomeCount,
        heldNoSlots,
      });
      if (!sim.ok) {
        stats.preflightBlocked += 1;
        book.markKilled(eventId);
        logger.warn('Bundle conversion blocked by eth_call preflight', strategyName, {
          eventId,
          reason: sim.reason,
        });
        for (const position of book.toPositions(eventId)) positions.push(position);
        return;
      }
      stats.preflightPassed += 1;
    }

    const released = book.convert(eventId, cfg);
    if (released > 0) {
      await orderManager.settleBundleConversion?.({
        legs: fills.map((f) => ({ tokenId: f.tokenId, aggressive: f.aggressive })),
        quantity: qty,
        payoutPerBundlePusd: 1 - cfg.conversionVaultFeePusd,
        timestamp: new Date(nowMs).toISOString(),
      });
      logger.info('Bundle converted on paper', strategyName, { eventId, releasedPusd: released });
    }
  }

  for (const position of book.toPositions(eventId)) positions.push(position);
  if (book.isComplete(eventId)) book.retire(eventId);
}

function emitBundleFill(
  fill: BundleFill,
  strategyName: StrategyName,
  emitTrade: (trade: TradeEvent) => void,
): void {
  emitTrade({
    orderId: fill.orderId,
    marketId: fill.conditionId,
    side: 'buy',
    fillPrice: fill.price.toFixed(4),
    fillSize: (fill.quantity * fill.price).toFixed(2),
    fees: fill.fees ?? '0',
    timestamp: fill.atMs,
    strategy: strategyName,
  });
}
