/**
 * Marketplace Strategy Helpers
 * Shared schemas and helpers for marketplace strategy route files
 */

import type { Request } from 'express';
import { z } from 'zod';

// Augment Express Request with properties set by upstream middleware.
// Single canonical identity source: req.tenant.id (set by raas-gate).
// req.user and req.apiKey are fallbacks for legacy middleware paths.
declare global {
  namespace Express {
    interface Request {
      tenant?: { id: string; tier?: string };
      user?: { id: string; tenantId?: string; tier?: string; role?: string };
      apiKey?: { userId?: string; isAdmin?: boolean };
    }
  }
}

// ==================== Validation Schemas ====================

export const publishBodySchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().min(50).max(2000),
  category: z.enum(['arbitrage', 'momentum', 'mean-reversion', 'statistical', 'portfolio', 'risk', 'hedging', 'other']),
  riskLevel: z.number().int().min(1).max(10),
  minAllocationUsd: z.number().int().min(100).max(100000),
  maxAllocationUsd: z.number().int().min(100).max(10000000),
  supportedExchanges: z.array(z.string()).optional(),
  tags: z.array(z.string()).max(10).optional(),
  backtestSummary: z.object({
    sharpe: z.number(),
    maxDrawdown: z.number(),
    winRate: z.number().min(0).max(100),
    periodDays: z.number().int().min(30),
    totalTrades: z.number().int().optional(),
  }).optional(),
});

export const updateStrategySchema = z.object({
  name: z.string().min(3).max(255).optional(),
  description: z.string().min(50).max(2000).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export const strategyFilterSchema = z.object({
  category: z.string().optional(),
  riskLevel: z.number().int().min(1).max(10).optional(),
  minSharpe: z.number().optional(),
  maxDrawdown: z.number().optional(),
  status: z.enum(['approved', 'suspended']).optional(),
  sortBy: z.enum(['sharpe', 'max_drawdown', 'win_rate', 'total_pnl', 'subscriber_count', 'created_at']).default('sharpe'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  search: z.string().max(100).optional(),
});

// ==================== Helpers ====================

export function getTenantId(req: Request): string {
  const tenantId = req.tenant?.id || req.user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

export function getUserId(req: Request): string {
  const userId = req.user?.id || req.apiKey?.userId;
  if (!userId) throw new Error('Unauthorized: No user context');
  return String(userId);
}

export function getQueryString(value: unknown, defaultValue: string = ''): string {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : String(first);
  }
  if (typeof value === 'string') return value;
  return String(value);
}

export function getQueryNumber(value: unknown, defaultValue: number = 0): number {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return parseInt(first, 10) || defaultValue;
    if (typeof first === 'number') return first;
    return defaultValue;
  }
  if (typeof value === 'string') return parseInt(value, 10) || defaultValue;
  if (typeof value === 'number') return value;
  return defaultValue;
}

export function isAdmin(req: Request): boolean {
  return req.user?.role === 'admin' || req.apiKey?.isAdmin === true;
}
