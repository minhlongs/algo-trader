/**
 * Multi-Leg Arbitrage Basket and Balance Types and Schemas
 *
 * @module desk/arbitrage/risk/risk-types-basket
 */

import { z } from 'zod';

// ── Multi-Leg Arbitrage Basket ──────────────────────────────────────────────

export type LegSide = 'buy' | 'sell' | 'BUY' | 'SELL';

export interface ArbitrageBasketLeg {
  legId: string;
  venue: string;
  symbol: string;
  side: LegSide;
  amount: number;
  price: number;
  notionalUsd?: number;
}

export const ArbitrageBasketLegSchema = z.object({
  legId: z.string(),
  venue: z.string(),
  symbol: z.string(),
  side: z.union([z.enum(['buy', 'sell']), z.enum(['BUY', 'SELL'])]),
  amount: z.number().positive(),
  price: z.number().positive(),
  notionalUsd: z.number().positive().optional(),
});

export interface MultiLegArbitrageBasket {
  basketId: string;
  opportunityId?: string;
  strategyKey?: string;
  legs: ArbitrageBasketLeg[];
  totalNotionalUsd?: number;
  expectedProfitUsd?: number;
  expectedProfitBps?: number;
  winProbability?: number;
  winLossRatio?: number;
  createdAt?: number;
}

export const MultiLegArbitrageBasketSchema = z.object({
  basketId: z.string(),
  opportunityId: z.string().optional(),
  strategyKey: z.string().optional(),
  legs: z.array(ArbitrageBasketLegSchema).min(1),
  totalNotionalUsd: z.number().positive().optional(),
  expectedProfitUsd: z.number().optional(),
  expectedProfitBps: z.number().optional(),
  winProbability: z.number().min(0).max(1).optional(),
  winLossRatio: z.number().positive().optional(),
  createdAt: z.number().optional(),
});

// ── Venue Balance Snapshot ──────────────────────────────────────────────────

export interface VenueBalanceSnapshot {
  venue: string;
  asset: string;
  free: number;
  locked?: number;
  total?: number;
  timestamp?: number;
}

export const VenueBalanceSnapshotSchema = z.object({
  venue: z.string(),
  asset: z.string(),
  free: z.number().nonnegative(),
  locked: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  timestamp: z.number().optional(),
});
