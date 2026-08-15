/**
 * Co-pilot intent handlers — 5 handlers for risk, arb, perf, regime, report.
 * Each handler wraps execution in Promise.race with a configurable timeout.
 */
import { timeout } from './copilot-utils';
import type { CopilotContext, HandlerFn, HandlerResult } from './copilot-types';

const handleRisk: HandlerFn = async (ctx, timeoutMs = 5000) => {
  const run = async (): Promise<HandlerResult> => {
    let signals: { strategyId: string; signal: string; confidence: number; ts: string }[] = [];
    if (ctx.env.SUBSCRIBERS) {
      try {
        const rows = await ctx.env.SUBSCRIBERS
          .prepare('SELECT id, tier, created_at FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 3')
          .bind(ctx.tenantId).all<{ id: string; tier: string; created_at: string }>();
        signals = rows.results.map(r => ({ strategyId: r.tier, signal: 'HOLD', confidence: 0.5, ts: r.created_at }));
      } catch { /* D1 unavailable */ }
    }
    const cached = await ctx.env.CACHE.get(`risk:${ctx.tenantId}`);
    let riskData: Record<string, unknown> | null = null;
    if (cached) { try { riskData = JSON.parse(cached); } catch { /* ignore */ } }
    const maxDrawdown = riskData ? (riskData as { maxDrawdown?: number }).maxDrawdown ?? 'N/A' : 'N/A';
    const varr = riskData ? (riskData as { varr?: number }).varr ?? 'N/A' : 'N/A';
    const summary = `🛡️ *Market Risk Analysis*\n\n📊 Drawdown: ${maxDrawdown}%\n📉 VaR (95%): ${varr}%\n📈 Active signals: ${signals.length}\n\n${signals.length > 0 ? signals.map(s => `• ${s.strategyId}: ${s.signal} (${(s.confidence * 100).toFixed(0)}%)`).join('\n') : 'No active signals. Strategies may be initializing.'}`;
    return { intent: 'risk', summary, details: { signals, riskData, maxDrawdown, varr }, action: { label: 'Refresh risk data' }, generatedAt: new Date().toISOString() };
  };
  return timeout('risk', timeoutMs, run());
};

// ──────────────────────────────────────────────
// Arbitrage handler
// ──────────────────────────────────────────────

const handleArb: HandlerFn = async (ctx, timeoutMs = 5000) => {
  const run = async (): Promise<HandlerResult> => {
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

  return timeout('arb', timeoutMs, run());
};

// ──────────────────────────────────────────────
// Performance handler
// ──────────────────────────────────────────────

const handlePerf: HandlerFn = async (ctx, timeoutMs = 5000) => {
  const run = async (): Promise<HandlerResult> => {
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

  return timeout('perf', timeoutMs, run());
};

// ──────────────────────────────────────────────
// Regime detection handler
// ──────────────────────────────────────────────

const handleRegime: HandlerFn = async (ctx, timeoutMs = 5000) => {
  const run = async (): Promise<HandlerResult> => {
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
        : '⏸️ Sideways — chờ breakout hoặc pullback.'}`;

    return {
      intent: 'regime',
      summary,
      details: { regime: regimeName, confidence, raw: regime },
      action: { label: 'Refresh regime' },
      generatedAt: new Date().toISOString(),
    };
  };

  return timeout('regime', timeoutMs, run());
};

// ──────────────────────────────────────────────
// Report handler
// ──────────────────────────────────────────────

const handleReport: HandlerFn = async (ctx, timeoutMs = 5000) => {
  const run = async (): Promise<HandlerResult> => {
    // Collect available data from KV
    const [regimeRaw, riskRaw, arbRaw] = await Promise.allSettled([
      ctx.env.CACHE.get('market:regime'),
      ctx.env.CACHE.get(`risk:${ctx.tenantId}`),
      ctx.env.CACHE.get(`arb:${ctx.tenantId}`),
    ]);

    const regime = regimeRaw.status === 'fulfilled' ? regimeRaw.value : null;
    const risk = riskRaw.status === 'fulfilled' ? riskRaw.value : null;
    const arb = arbRaw.status === 'fulfilled' ? arbRaw.value : null;

    let regimeName = 'UNKNOWN';
    let riskInfo = 'N/A';
    let arbCount = 0;

    if (regime) {
      try { regimeName = (JSON.parse(regime) as { regime: string }).regime; } catch { /* ignore */ }
    }
    if (risk) {
      try {
        const r = JSON.parse(risk) as { maxDrawdown?: number };
        riskInfo = `Drawdown: ${r.maxDrawdown ?? 'N/A'}%`;
      } catch { /* ignore */ }
    }
    if (arb) {
      try { arbCount = (JSON.parse(arb) as unknown[]).length; } catch { /* ignore */ }
    }

    const summary = `📋 *Trading Report*\n\n` +
      `🌐 Regime: ${regimeName}\n` +
      `🛡️ Risk: ${riskInfo}\n` +
      `💱 Arb opps: ${arbCount}\n\n` +
      `_Data sourced from KV cache. Live data requires VPS backend._`;

    return {
      intent: 'report',
      summary,
      details: { regime: regimeName, risk: riskInfo, arbCount },
      generatedAt: new Date().toISOString(),
    };
  };

  return timeout('report', timeoutMs, run());
};

// ──────────────────────────────────────────────
// Handler registry
// ──────────────────────────────────────────────

export const HANDLERS: Record<string, HandlerFn> = {
  risk: handleRisk,
  arb: handleArb,
  perf: handlePerf,
  regime: handleRegime,
  report: handleReport,
};
