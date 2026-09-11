/**
 * Marketplace Strategy Schemas
 * Zod schemas for strategy publication, filtering, and vetting decisions.
 */

import { z } from 'zod';

export const publishStrategySchema = z.object({
  name: z.string().min(3).max(255).describe('Strategy name'),
  description: z.string().min(50).max(2000).describe('Detailed strategy description'),
  category: z.enum([
    'arbitrage',
    'momentum',
    'mean-reversion',
    'statistical',
    'portfolio',
    'risk',
    'hedging',
    'other'
  ]).describe('Strategy category'),
  riskLevel: z.number().int().min(1).max(10).describe('Risk level 1-10'),
  minAllocationUsd: z.number().int().min(100).max(100000).describe('Minimum investment in cents'),
  maxAllocationUsd: z.number().int().min(100).max(10000000).describe('Maximum investment in cents'),
  supportedExchanges: z.array(z.string()).optional().describe('List of supported exchanges'),
  tags: z.array(z.string()).max(10).optional().describe('Strategy tags for search'),
  backtestSummary: z.object({
    sharpe: z.number().describe('Sharpe ratio from backtest'),
    maxDrawdown: z.number().describe('Max drawdown percentage'),
    winRate: z.number().min(0).max(100).describe('Win rate percentage'),
    periodDays: z.number().int().min(30).describe('Backtest period in days'),
    totalTrades: z.number().int().optional().describe('Total trades in backtest'),
  }).optional().describe('Backtest performance summary'),
});

export const strategyFilterSchema = z.object({
  category: z.string().optional(),
  riskLevel: z.number().int().min(1).max(10).optional(),
  minSharpe: z.number().optional(),
  maxDrawdown: z.number().optional(),
  status: z.enum(['approved', 'suspended']).optional(),
  sortBy: z.enum([
    'sharpe',
    'max_drawdown',
    'win_rate',
    'total_pnl',
    'subscriber_count',
    'created_at'
  ]).default('sharpe'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
  search: z.string().max(100).optional().describe('Full-text search in name/description'),
});

export const vettingDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'request_changes']),
  rejectionReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});
