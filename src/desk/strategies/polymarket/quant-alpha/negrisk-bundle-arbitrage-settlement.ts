/**
 * Event-level NegRisk Bundle Arbitrage — Settlement & `eth_call` Preflight Gate.
 *
 * Verifies on-chain settlement preflight via `CtfEthCallPreflight` before booking
 * bundle conversions on `BundleBook` / `OrderManager`, failing closed on any
 * `negRiskMarketId` / bitmask / condition mismatch or `eth_call` revert:
 *  - When `event.negRiskMarketId` (`bytes32`) is present, maps each unique filled
 *    leg to its canonical on-chain slot index in `event.markets` and simulates
 *    `NegRiskAdapter.convertPositions`.
 *  - When `event.negRiskMarketId` is omitted on a multi-outcome NegRisk event,
 *    verifies per-condition `simulateMergePositions` across ALL unique filled
 *    conditions (never just `fills[0]`).
 */

import type { GammaEvent } from '../../../polymarket/gamma-client';
import type { OrderManager } from '../../../polymarket/order-manager';
import {
  toMarketBytes32,
  type CtfEthCallPreflight,
  type CtfPreflightResult,
} from '../../../polymarket/ctf-eth-call-preflight';
import { logger } from '../../../core/logger';
import type { OpenPosition, TradeEvent } from '../base-polymarket-strategy';
import type { BundleBook, BundleFill } from './negrisk-bundle-arbitrage-state';
import type { NegRiskBundleConfig } from './negrisk-bundle-arbitrage-types';
import type { StrategyName } from '../../../core/types';

const BYTES32_HEX_RE = /^0x[0-9a-fA-F]{64}$/;

export interface BundlePreflightStats {
  preflightPassed: number;
  preflightBlocked: number;
  excludedFiveMinuteEvents: number;
}

export interface SettleBundleParams {
  event: GammaEvent;
  nowMs: number;
  totalOutcomeCount: number;
  book: BundleBook;
  cfg: NegRiskBundleConfig;
  orderManager: OrderManager;
  strategyName: StrategyName;
  positions: OpenPosition[];
  emitTrade: (trade: TradeEvent) => void;
  ctfPreflight?: CtfEthCallPreflight;
  /** When true, fail closed if `ctfPreflight` is omitted (required outside offline paper mode). */
  requirePreflight?: boolean;
  stats: BundlePreflightStats;
}

/** Total volume carried across all markets of one Gamma event. */
export function eventVolume(event: GammaEvent): number {
  let total = 0;
  for (const market of event.markets) total += market.volume ?? 0;
  return total;
}

async function runBundlePreflight(
  event: GammaEvent,
  fills: readonly BundleFill[],
  amountRaw: bigint,
  totalOutcomeCount: number,
  ctfPreflight: CtfEthCallPreflight,
): Promise<CtfPreflightResult> {
  const uniqueByToken = new Map<string, BundleFill>();
  for (const fill of fills) if (!uniqueByToken.has(fill.tokenId)) uniqueByToken.set(fill.tokenId, fill);
  const uniqueFills = [...uniqueByToken.values()];

  if (event.negRiskMarketId !== undefined) {
    if (!BYTES32_HEX_RE.test(event.negRiskMarketId)) {
      return { ok: false, to: '', calldata: '0x', mode: 'unconfigured', reason: 'invalid-negrisk-market-bytes32' };
    }
    const slotCount = Math.max(event.markets.length, totalOutcomeCount, uniqueFills.length);
    const slots: number[] = [];
    for (const fill of uniqueFills) {
      const slotIdx = event.markets.findIndex(
        (m) => m.conditionId === fill.conditionId || m.yesTokenId === fill.tokenId || m.noTokenId === fill.tokenId,
      );
      if (slotIdx < 0) {
        return { ok: false, to: '', calldata: '0x', mode: 'unconfigured', reason: 'unmapped-outcome-slot' };
      }
      slots.push(slotIdx);
    }
    const indexSet = slots.reduce((m, s) => m | (1n << BigInt(s)), 0n);
    return ctfPreflight.simulateConvertPositions({
      marketId: event.negRiskMarketId,
      indexSet,
      amountRaw,
      outcomeCount: slotCount,
      heldNoSlots: slots,
    });
  }

  // Without an explicit bytes32 negRiskMarketId, verify merge preflight on EVERY unique condition leg.
  const conditionIds = [...new Set(uniqueFills.map((f) => f.conditionId).filter(Boolean))];
  if (conditionIds.length === 0) {
    return { ok: false, to: '', calldata: '0x', mode: 'unconfigured', reason: 'empty-bundle-conditions' };
  }
  let lastSim: CtfPreflightResult | undefined;
  for (const condId of conditionIds) {
    lastSim = await ctfPreflight.simulateMergePositions({
      conditionId: toMarketBytes32(condId),
      amountRaw,
    });
    if (!lastSim.ok) return lastSim;
  }
  return lastSim!;
}

/** Emits fills, verifies `eth_call` preflight when configured, settles complete baskets, and tracks residuals. */
export async function settleOrRecordBundle(params: SettleBundleParams): Promise<void> {
  const { event, nowMs, totalOutcomeCount, book, cfg, orderManager, strategyName, positions, emitTrade, ctfPreflight, requirePreflight, stats } = params;
  const eventId = event.id;
  const fills = book.filledLegs(eventId);
  for (const fill of fills) emitBundleFill(fill, strategyName, emitTrade);

  if (book.isComplete(eventId)) {
    const qty = book.convertibleQuantity(eventId);
    if (qty > 0 && requirePreflight && !ctfPreflight) {
      stats.preflightBlocked += 1;
      book.markKilled(eventId);
      logger.warn('Bundle settlement blocked: eth_call preflight required but unconfigured', strategyName, { eventId });
      for (const position of book.toPositions(eventId)) positions.push(position);
      return;
    }
    if (qty > 0 && ctfPreflight) {
      const amountRaw = BigInt(Math.max(1, Math.round(qty * 1e6)));
      const sim = await runBundlePreflight(event, fills, amountRaw, totalOutcomeCount, ctfPreflight);
      if (!sim.ok) {
        stats.preflightBlocked += 1;
        book.markKilled(eventId);
        logger.warn('Bundle settlement blocked by eth_call preflight', strategyName, { eventId, reason: sim.reason });
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

function emitBundleFill(fill: BundleFill, strategyName: StrategyName, emitTrade: (trade: TradeEvent) => void): void {
  emitTrade({
    orderId: fill.orderId, marketId: fill.conditionId, side: 'buy',
    fillPrice: fill.price.toFixed(4), fillSize: (fill.quantity * fill.price).toFixed(2),
    fees: fill.fees ?? '0', timestamp: fill.atMs, strategy: strategyName,
  });
}
