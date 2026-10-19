/**
 * Co-pilot market intent handlers — risk analysis & arbitrage scanning.
 */
import { timeout } from './copilot-utils';
import type { HandlerFn, HandlerResult } from './copilot-types';

export const handleRisk: HandlerFn = async (ctx, timeoutMs = 5000) => {
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

export const handleArb: HandlerFn = async (ctx, timeoutMs = 5000) => {
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
