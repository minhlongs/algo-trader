/**
 * Co-pilot type definitions, interfaces, and classification constants.
 *
 * Extracted from copilot.ts during modularization (2026-08-14).
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export type Env = {
  CACHE: KVNamespace;
  SUBSCRIBERS?: D1Database;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  ENVIRONMENT?: string;
  VPS_ORIGIN?: string;
  REGION_ROUTING_ENABLED?: string;
  TELEGRAM_BOT_TOKEN?: string;
};

// ──────────────────────────────────────────────
// Intent classification
// ──────────────────────────────────────────────

export type IntentType = 'risk' | 'arb' | 'perf' | 'regime' | 'report';

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  matchedKeywords: string[];
}

export const INTENT_PATTERNS: { intent: IntentType; keywords: string[]; weight: number }[] = [
  {
    intent: 'risk',
    keywords: ['risk', 'drawdown', 'varr', 'volatility', 'volatilitas', 'exposure', 'loss', 'kerugian', 'stop loss', 'margin', 'leverage', 'risiko'],
    weight: 1.0,
  },
  {
    intent: 'arb',
    keywords: ['arbitrage', 'arb', 'spread', 'price difference', 'opportunity', 'peluang', 'cross exchange', 'cex', 'gas fee', 'slippage'],
    weight: 1.0,
  },
  {
    intent: 'perf',
    keywords: ['performance', 'perf', 'profit', 'keuntungan', 'pnl', 'return', 'win rate', 'accuracy', 'sharpe', 'backtest', 'result', 'hasil'],
    weight: 1.0,
  },
  {
    intent: 'regime',
    keywords: ['regime', 'trend', 'bull', 'bear', 'sideways', 'market condition', 'kondisi pasar', 'indicator', 'rsi', 'macd', 'ma crossover', 'bollinger'],
    weight: 1.0,
  },
  {
    intent: 'report',
    keywords: ['report', 'laporan', 'summary', 'ringkasan', 'daily', 'weekly', 'monthly', 'chart', 'statistik', 'overview', 'dashboard'],
    weight: 1.0,
  },
];

// ──────────────────────────────────────────────
// Handler interfaces
// ──────────────────────────────────────────────

export interface CopilotContext {
  tier: string;
  tenantId: string;
  query: string;
  env: Env;
}

export interface HandlerResult {
  intent: IntentType;
  summary: string;
  details: Record<string, unknown>;
  action?: { label: string; url?: string; payload?: Record<string, unknown> };
  generatedAt: string;
}

export type HandlerFn = (ctx: CopilotContext, timeoutMs?: number) => Promise<HandlerResult>;

// ──────────────────────────────────────────────
// Rate limiter config (KV-backed, sliding window)
// ──────────────────────────────────────────────

export const RATE_LIMITS: Record<string, number> = {
  FREE: 5,
  STARTER: 10,
  PRO: 20,
  ENTERPRISE: 40,
  MASTER: 200,
};
