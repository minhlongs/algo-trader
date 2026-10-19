/**
 * Co-pilot intent handlers — 5 handlers for risk, arb, perf, regime, report.
 * Each handler wraps execution in Promise.race with a configurable timeout.
 */
/**
 * Co-pilot intent handlers — 5 handlers for risk, arb, perf, regime, report.
 * Each handler wraps execution in Promise.race with a configurable timeout.
 */
import { timeout } from './copilot-utils';
import type { HandlerFn, HandlerResult } from './copilot-types';
import { handleRisk, handleArb } from './copilot-handlers-market';

export { handleRisk, handleArb } from './copilot-handlers-market';

// ──────────────────────────────────────────────
// Performance handler
// ──────────────────────────────────────────────

export const handlePerf: HandlerFn = async (ctx, timeoutMs = 5000) => {
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

export const handleRegime: HandlerFn = async (ctx, timeoutMs = 5000) => {
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

export const handleReport: HandlerFn = async (ctx, timeoutMs = 5000) => {
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

