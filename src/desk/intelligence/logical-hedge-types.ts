/**
 * Logical Hedge Types and Configuration Constants.
 */

export type HedgeTier = 'T1' | 'T2' | 'T3'; // T1: >=95%, T2: 90-95%, T3: 85-90%

export interface MarketInput {
  id: string;
  title: string;
  description?: string;
  yesPrice: number;
}

export interface LogicalHedge {
  id: string;
  marketA: { id: string; title: string; yesPrice: number };
  marketB: { id: string; title: string; yesPrice: number };
  implication: string;
  contrapositive: string;
  confidence: number;
  tier: HedgeTier;
  expectedEdge: number;
  hedgeStrategy: string;
}

export interface RawHedgeItem {
  marketA_title?: string;
  marketB_title?: string;
  implication?: string;
  contrapositive?: string;
  confidence?: number;
}

export const BATCH_SIZE = 10;
export const MIN_CONFIDENCE = 0.85;
export const DEEPSEEK_TIMEOUT_MS = 120_000;
export const CACHE_TTL_SECONDS = 2 * 60 * 60;
