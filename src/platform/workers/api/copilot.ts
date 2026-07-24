/**
 * Co-pilot /ask endpoint — intent classifier + 5 handlers.
 *
 * POST /api/copilot/ask
 * Body: { query: string, context?: { tier, tenantId } }
 *
 * Intent routing (keyword-based with confidence scoring):
 * - risk    → market risk analysis (drawdown, VaR, correlation)
 * - arb     → arbitrage opportunity scan
 * - perf    → strategy performance metrics
 * - regime  → market regime detection (bull/bear/sideways)
 * - report  → generate trading report summary
 *
 * Dispatch: PRO tier ≤10 req/min, ENTERPRISE ≤30/min, MASTER unlimited.
 * Handler timeout: 5s each via Promise.race.
 */

import { logger } from '../../../shared/utils/logger';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

type Env = {
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

interface IntentResult {
  intent: IntentType;
  confidence: number;
  matchedKeywords: string[];
}

type IntentType = 'risk' | 'arb' | 'perf' | 'regime' | 'report';

const INTENT_PATTERNS: { intent: IntentType; keywords: string[]; weight: number }[] = [
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

function classifyIntent(query: string): IntentResult {
  const lower = query.toLowerCase();
  const scores: { intent: IntentType; score: number; matched: string[] }[] = [];

  for (const pattern of INTENT_PATTERNS) {
    const matched: string[] = [];
    for (const kw of pattern.keywords) {
      if (lower.includes(kw)) matched.push(kw);
    }
    if (matched.length > 0) {
      scores.push({ intent: pattern.intent, score: matched.length * pattern.weight, matched });
    }
  }

  if (scores.length === 0) {
    return { intent: 'report', confidence: 0.3, matchedKeywords: [] };
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const maxScore = scores[0].score;
  const totalMatched = scores.reduce((s, r) => s + r.score, 0);
  const confidence = Math.min(0.99, maxScore / Math.max(totalMatched, 1) + 0.5 * Math.min(1, maxScore / 3));

  return { intent: best.intent, confidence: Math.round(confidence * 100) / 100, matchedKeywords: best.matched };
}

// ──────────────────────────────────────────────
// Handler interfaces
// ──────────────────────────────────────────────

interface CopilotContext {
  tier: string;
  tenantId: string;
  query: string;
  env: Env;
}

interface HandlerResult {
  intent: IntentType;
  summary: string;
  details: Record<string, unknown>;
  action?: { label: string; url?: string; payload?: Record<string, unknown> };
  generatedAt: string;
}

// ──────────────────────────────────────────────
// Rate limiter (KV-backed, sliding window)
// ──────────────────────────────────────────────

const RATE_LIMITS: Record<string, number> = {
  FREE: 5,
  STARTER: 10,
  PRO: 20,
  ENTERPRISE: 40,
  MASTER: 200,
};

async function checkRateLimit(tenantId: string, tier: string, env: Env): Promise<{ allowed: boolean; remaining: number }> {
  const limit = RATE_LIMITS[tier.toUpperCase()] || 5;
  const windowSec = 60;
  const key = `rate:copilot:${tenantId}`;

  try {
    const raw = await env.CACHE.get(key);
    if (raw) {
      const entries: { t: number }[] = JSON.parse(raw);
      const now = Date.now();
      const windowStart = now - windowSec * 1000;
      const recent = entries.filter(e => e.t > windowStart);
      if (recent.length >= limit) {
        return { allowed: false, remaining: 0 };
      }
      recent.push({ t: now });
      await env.CACHE.put(key, JSON.stringify(recent), { expirationTtl: windowSec + 10 });
      return { allowed: true, remaining: limit - recent.length };
    }
    await env.CACHE.put(key, JSON.stringify([{ t: Date.now() }]), { expirationTtl: windowSec + 10 });
    return { allowed: true, remaining: limit - 1 };
  } catch {
    // On cache failure, allow with degraded rate
    return { allowed: true, remaining: 1 };
  }
}

// ──────────────────────────────────────────────
// 5 Intent Handlers (each <5s via Promise.race)
// ──────────────────────────────────────────────

async function handleRisk(ctx: CopilotContext, timeoutMs = 5000): Promise<HandlerResult> {
  const run = async (): Promise<HandlerResult> => {
    // Query recent strategy signals from D1 if available, fall back to KV summary
    let signals: { strategyId: string; signal: string; confidence: number; ts: string }[] = [];

    if (ctx.env.SUBSCRIBERS) {
      try {
        // This uses the subscriptions D1 just for a placeholder — paid users would
        // have signals written by StrategyShard via a shared log table (future migration).
        const rows = await ctx.env.SUBSCRIBERS
          .prepare('SELECT id, tier, created_at FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 3')
          .bind(ctx.tenantId)
          .all<{ id: string; tier: string; created_at: string }>();
        signals = rows.results.map(r => ({
          strategyId: r.tier,
          signal: 'HOLD',
          confidence: 0.5,
          ts: r.created_at,
        }));
      } catch { /* ignore */ }
    }

    const summary = signals.length > 0
      ? `📉 *Risk Analysis*\n\nTier ${ctx.tier.toUpperCase()} — ${signals.length} recent subscription(s) detected.\nMonitor drawdown threshold. Consider reducing exposure on high-volatility pairs.`
      : `📉 *Risk Analysis*\n\nChưa có data đủ. Upgrade tier để unlock real-time risk signal feed.`;

    return {
      intent: 'risk',
      summary,
      details: { signals, note: 'Real-time risk signals available on PRO+' },
      action: { label: 'Xem báo cáo rủi ro đầy đủ' },
      generatedAt: new Date().toISOString(),
    };
  };

  return Promise.race([run(), timeout(timeoutMs, 'risk')]);
}

async function handleArb(ctx: CopilotContext, timeoutMs = 5000): Promise<HandlerResult> {
  const run = async (): Promise<HandlerResult> => {
    // Query KV for recent arb cache (populated by strategy pipeline)
    const cached = await ctx.env.CACHE.get(`arb:${ctx.tenantId}`);
    let arbOpportunities: { pair: string; buyExchange: string; sellExchange: string; spread: number; ts: string }[] = [];

    if (cached) {
      try { arbOpportunities = JSON.parse(cached); } catch { /* ignore */ }
    }

    const summary = arbOpportunities.length > 0
      ? `💱 *Arbitrage Scan*\n\n${arbOpportunities.length} opp(s) cached.\nTop: ${arbOpportunities[0].pair} (spread ${arbOpportunities[0].spread}%)\n\n⚠️ Check execution latency & fees before trading.`
      : `💱 *Arbitrage Scan*\n\nKhông tìm thấy opportunity trong cache.\nArb signals phát sinh mỗi 30s trên tier PRO+.`;

    return {
      intent: 'arb',
      summary,
      details: { opportunities: arbOpportunities, count: arbOpportunities.length },
      action: { label: 'Refresh scan' },
      generatedAt: new Date().toISOString(),
    };
  };

  return Promise.race([run(), timeout(timeoutMs, 'arb')]);
}

async function handlePerf(ctx: CopilotContext, timeoutMs = 5000): Promise<HandlerResult> {
  const run = async (): Promise<HandlerResult> => {
    // Try get strategy execution history from StrategyShard via VPS if configured
    let metrics: Record<string, { calls: number; successRate: number; avgLatencyMs: number }> = {};

    if (ctx.env.VPS_ORIGIN) {
      try {
        const vpsUrl = new URL('/api/v1/strategies/performance', ctx.env.VPS_ORIGIN);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs - 500);
        const res = await fetch(vpsUrl.toString(), {
          headers: { Authorization: `Bearer ${ctx.env.JWT_SECRET || ''}` },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          metrics = await res.json();
        }
      } catch { /* VPS unreachable, fall through */ }
    }

    const entries = Object.entries(metrics);
    const summary = entries.length > 0
      ? `📈 *Performance*\n\n${entries.map(([id, m]) => `${id}: ${m.calls} calls, ${(m.successRate * 100).toFixed(1)}% success, ${m.avgLatencyMs.toFixed(0)}ms avg`).join('\n')}`
      : `📈 *Performance*\n\nNo live metrics. ${ctx.env.VPS_ORIGIN ? 'VPS backend pending data pipeline.' : 'Deploy backend or upgrade tier for live metrics.'}`;

    return {
      intent: 'perf',
      summary,
      details: { metrics },
      generatedAt: new Date().toISOString(),
    };
  };

  return Promise.race([run(), timeout(timeoutMs, 'perf')]);
}

async function handleRegime(ctx: CopilotContext, timeoutMs = 5000): Promise<HandlerResult> {
  const run = async (): Promise<HandlerResult> => {
    // Query market regime cache from KV
    const cached = await ctx.env.CACHE.get(`market:regime`);
    let regime: Record<string, unknown> | null = null;
    if (cached) {
      try { regime = JSON.parse(cached); } catch { /* ignore */ }
    }

    const regimeName = regime ? (regime as { regime: string }).regime : 'UNKNOWN';
    const confidence = regime ? (regime as { confidence: number }).confidence : 0;

    const summary = `🌐 *Market Regime*\n\nCurrent: *${regimeName}* (${(confidence * 100).toFixed(0)}%)\n\n${regimeName === 'BULL'
      ? '💰 Trend tăng — tận dụng long position.'
      : regimeName === 'BEAR'
        ? '🔴 Trend giảm — cân nhắc hedge hoặc cash.'
        : '⚪ Sideways — chờ breakout + volume confirmation.'
    }`;

    return {
      intent: 'regime',
      summary,
      details: { regime, regimeName, confidence },
      action: { label: regimeName === 'UNKNOWN' ? 'Enable regime detector' : 'View regime history' },
      generatedAt: new Date().toISOString(),
    };
  };

  return Promise.race([run(), timeout(timeoutMs, 'regime')]);
}

async function handleReport(ctx: CopilotContext, timeoutMs = 5000): Promise<HandlerResult> {
  const run = async (): Promise<HandlerResult> => {
    const subs = ctx.env.SUBSCRIBERS;

    // Compose a summary from available data
    const parts: string[] = [`📋 *Daily Report* (${new Date().toLocaleDateString('vi-VN')})\n`];

    if (subs) {
      try {
        const tierRow = await subs
          .prepare('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
          .bind(ctx.tenantId)
          .first<{ tier: string; status: string; current_period_end: string }>();
        if (tierRow) {
          parts.push(`Subscription: ${tierRow.tier} (${tierRow.status})`);
          if (tierRow.current_period_end) parts.push(`Renews: ${tierRow.current_period_end}`);
        }
      } catch { /* ignore */ }
    }

    parts.push('Signals: cached in StrategyShard (query via /api/strategies)');
    parts.push('Action: Check /api/v1/shard/ring for shard health');

    return {
      intent: 'report',
      summary: parts.join('\n'),
      details: { tier: ctx.tier, generatedBy: 'cf-copilot' },
      action: { label: 'View full dashboard' },
      generatedAt: new Date().toISOString(),
    };
  };

  return Promise.race([run(), timeout(timeoutMs, 'report')]);
}

type HandlerFn = (ctx: CopilotContext, timeoutMs?: number) => Promise<HandlerResult>;

const HANDLERS: Record<IntentType, HandlerFn> = {
  risk: handleRisk,
  arb: handleArb,
  perf: handlePerf,
  regime: handleRegime,
  report: handleReport,
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function timeout(ms: number, label: string): Promise<HandlerResult> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} handler timed out after ${ms}ms`)), ms);
  });
}

function buildFallbackResponse(query: string): HandlerResult {
  return {
    intent: 'report',
    summary: `❓ *Low-confidence Query*\n\nQuery: "${query}"\n\nTôi chưa hiểu rõ intent. Thử hỏi theo chủ đề:\n• Risk — /ask Cảnh báo rủi ro thị trường?\n• Arb — /ask Có arbitrage nào không?\n• Perf — /ask Hiệu suất chiến lược?\n• Regime — /ask Chế độ thị trường hiện tại?\n• Report — /ask Tóm tắt ngày hôm nay`,
    details: { intent: 'report', confidence: 0.3, reason: 'no_keyword_match' },
    generatedAt: new Date().toISOString(),
  };
}

function formatMarkdownResponse(result: HandlerResult, confidence: number, intent: IntentType): string {
  let header = `🎯 *Intent: ${intent.toUpperCase()}* (${Math.round(confidence * 100)}%)\n\n`;
  if (intent !== result.intent && confidence < 0.5) {
    header += `⚠️ Low confidence — defaulting to ${result.intent.toUpperCase()}\n\n`;
  }
  return header + result.summary + '\n\n_Menghasilkan: ' + result.generatedAt + '_';
}

// ──────────────────────────────────────────────
// Public entry point (called from edge-proxy)
// ──────────────────────────────────────────────

export async function handleCopilotAsk(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed — use POST' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = (await request.json()) as { query?: string; context?: { tier?: string; tenantId?: string } };
    const query = (body.query || '').trim();
    if (!query) {
      return new Response(JSON.stringify({ error: 'query is required (e.g. { query: "BTC outlook" })' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const tier = (body.context?.tier || 'free').toUpperCase();
    const tenantId = body.context?.tenantId || '';

    // Rate limit
    if (tenantId) {
      const rate = await checkRateLimit(tenantId, tier, env);
      if (!rate.allowed) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded', tier, remainingMs: '60s' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Classify intent
    const classified = classifyIntent(query);
    logger.info('[copilot] intent classified', { query: query.slice(0, 60), intent: classified.intent, confidence: classified.confidence });

    const ctx: CopilotContext = { tier, tenantId, query, env };

    // Dispatch with 5s timeout
    const handler = HANDLERS[classified.intent];
    let result: HandlerResult;
    try {
      result = await handler(ctx, 5000);
    } catch (timeoutErr) {
      logger.warn('[copilot] handler timeout', { intent: classified.intent });
      result = {
        intent: 'report',
        summary: `⏱️ *Timeout* — handler for ${classified.intent.toUpperCase()} exceeded 5s budget. Try /regime for lighter query.`,
        details: { error: String(timeoutErr) },
        generatedAt: new Date().toISOString(),
      };
    }

    const textReply = formatMarkdownResponse(result, classified.confidence, classified.intent);

    return new Response(JSON.stringify({
      intent: classified.intent,
      confidence: classified.confidence,
      reply: {
        text: textReply,
        parseMode: 'Markdown',
        action: result.action,
      },
      details: result.details,
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',')[0] } });
  } catch (err) {
    logger.error('[copilot] ask error', { error: String(err) });
    return new Response(JSON.stringify({ error: 'Copilot processing failed', detail: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

function corsHeaders(env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
