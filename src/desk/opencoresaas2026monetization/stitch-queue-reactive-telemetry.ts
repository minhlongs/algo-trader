// SPDX-License-Identifier: MIT
/**
 * Stitch Screen #16 — Queue-Reactive LOB, Roll Implied Spread & Hasbrouck Information Share Telemetry
 * Powers `site/public/limit-order-queue-cockpit.html` and `GET /api/v1/stitch-cockpit/queue-reactive`.
 */

export interface VenueInformationShareNode {
  readonly venue: string;
  readonly hasbrouckInfoSharePct: number;
  readonly rollImpliedSpreadBps: number;
  readonly huangStollAdverseSelectionPct: number;
  readonly queueDepletionProb100ms: number;
  readonly leadLagStatus: 'PRICE_LEADER' | 'CO_DISCOVERY' | 'LAGGING_FOLLOWER';
}

export interface QueueReactiveCockpitSnapshot {
  readonly screenId: 'projects/1566829715937419119/screens/a8b3d172c9404e6685f10293847561ab';
  readonly file: 'site/public/limit-order-queue-cockpit.html';
  readonly bestBidQueueSizeLots: number;
  readonly bestAskQueueSizeLots: number;
  readonly queueImbalanceRatio: number;
  readonly rollEffectiveSpreadBps: number;
  readonly adverseSelectionSharePct: number;
  readonly inventoryHoldingSharePct: number;
  readonly orderProcessingSharePct: number;
  readonly venues: readonly VenueInformationShareNode[];
}

export function buildQueueReactiveCockpitSnapshot(
  bestBidQueueSizeLots = 18.4,
  bestAskQueueSizeLots = 9.6,
): QueueReactiveCockpitSnapshot {
  const totalTopQueue = Math.max(0.01, bestBidQueueSizeLots + bestAskQueueSizeLots);
  const queueImbalanceRatio = Number(
    ((bestBidQueueSizeLots - bestAskQueueSizeLots) / totalTopQueue).toFixed(4),
  );
  const rollEffectiveSpreadBps = 1.64;
  const adverseSelectionSharePct = 46.2;
  const inventoryHoldingSharePct = 18.5;
  const orderProcessingSharePct = 35.3;

  const venues: readonly VenueInformationShareNode[] = [
    {
      venue: 'Binance Perp (TY3)',
      hasbrouckInfoSharePct: 48.5,
      rollImpliedSpreadBps: 1.24,
      huangStollAdverseSelectionPct: 44.8,
      queueDepletionProb100ms: 0.14,
      leadLagStatus: 'PRICE_LEADER',
    },
    {
      venue: 'OKX Perp (HKG)',
      hasbrouckInfoSharePct: 24.2,
      rollImpliedSpreadBps: 1.58,
      huangStollAdverseSelectionPct: 47.1,
      queueDepletionProb100ms: 0.21,
      leadLagStatus: 'CO_DISCOVERY',
    },
    {
      venue: 'Hyperliquid L1',
      hasbrouckInfoSharePct: 16.8,
      rollImpliedSpreadBps: 1.82,
      huangStollAdverseSelectionPct: 51.4,
      queueDepletionProb100ms: 0.26,
      leadLagStatus: 'CO_DISCOVERY',
    },
    {
      venue: 'Bybit Linear (SIN)',
      hasbrouckInfoSharePct: 10.5,
      rollImpliedSpreadBps: 1.94,
      huangStollAdverseSelectionPct: 39.6,
      queueDepletionProb100ms: 0.19,
      leadLagStatus: 'LAGGING_FOLLOWER',
    },
  ];

  return {
    screenId: 'projects/1566829715937419119/screens/a8b3d172c9404e6685f10293847561ab',
    file: 'site/public/limit-order-queue-cockpit.html',
    bestBidQueueSizeLots,
    bestAskQueueSizeLots,
    queueImbalanceRatio,
    rollEffectiveSpreadBps,
    adverseSelectionSharePct,
    inventoryHoldingSharePct,
    orderProcessingSharePct,
    venues,
  };
}
