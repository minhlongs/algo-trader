/**
 * Logical Hedge Classifier and Builder.
 */

import crypto from 'crypto';
import type { HedgeTier, MarketInput, LogicalHedge, RawHedgeItem } from './logical-hedge-types';

export function classifyTier(confidence: number): HedgeTier | null {
  if (confidence >= 0.95) return 'T1';
  if (confidence >= 0.90) return 'T2';
  if (confidence >= 0.85) return 'T3';
  return null;
}

export function buildHedge(raw: RawHedgeItem, markets: MarketInput[]): LogicalHedge | null {
  const confidence = raw.confidence ?? 0;
  const tier = classifyTier(confidence);
  if (!tier) return null;

  const titleA = raw.marketA_title ?? '';
  const titleB = raw.marketB_title ?? '';
  const marketA = markets.find(m => m.title === titleA);
  const marketB = markets.find(m => m.title === titleB);
  if (!marketA || !marketB) return null;

  const edge = Math.max(0, marketA.yesPrice - marketB.yesPrice);
  const hedgeStrategy = 'logical-necessity';
  const id = crypto.createHash('md5').update(`${marketA.id}:${marketB.id}:${Date.now()}`).digest('hex');

  return {
    id,
    marketA: { id: marketA.id, title: marketA.title, yesPrice: marketA.yesPrice },
    marketB: { id: marketB.id, title: marketB.title, yesPrice: marketB.yesPrice },
    implication: raw.implication ?? 'Unknown implication',
    contrapositive: raw.contrapositive ?? 'Unknown contrapositive',
    confidence,
    tier,
    expectedEdge: edge,
    hedgeStrategy,
  };
}
