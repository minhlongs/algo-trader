/**
 * Co-pilot utility functions: intent classification, rate limiting,
 * timeout wrapper, response builders, and CORS headers.
 *
 * Extracted from copilot.ts during modularization (2026-08-14).
 */

import {
  INTENT_PATTERNS,
  RATE_LIMITS,
  type Env,
  type IntentResult,
  type IntentType,
  type HandlerResult,
  type CopilotContext,
} from './copilot-types';

// ──────────────────────────────────────────────
// Intent classifier
// ──────────────────────────────────────────────

export function classifyIntent(query: string): IntentResult {
  const q = query.toLowerCase();
  let best: IntentResult = { intent: 'perf', confidence: 0, matchedKeywords: [] };

  for (const { intent, keywords, weight } of INTENT_PATTERNS) {
    const matched = keywords.filter(k => q.includes(k));
    const score = (matched.length / keywords.length) * weight;
    if (score > best.confidence) {
      best = { intent, confidence: parseFloat(score.toFixed(2)), matchedKeywords: matched };
    }
  }

  // Boost exact intent prefix
  const intentPrefixes: Record<string, IntentType> = {
    '/risk': 'risk',
    '/arb': 'arb',
    '/perf': 'perf',
    '/regime': 'regime',
    '/report': 'report',
  };
  for (const [prefix, intent] of Object.entries(intentPrefixes)) {
    if (q.startsWith(prefix)) {
      best = { intent, confidence: 1.0, matchedKeywords: [prefix] };
    }
  }

  return best;
}

// ──────────────────────────────────────────────
// Rate limiter (KV-backed, sliding window)
// ──────────────────────────────────────────────

export async function checkRateLimit(
  tenantId: string,
  tier: string,
  env: Env,
): Promise<{ allowed: boolean; remainingMs: number; tier: string; limit: number }> {
  const limit = RATE_LIMITS[tier] ?? RATE_LIMITS['FREE'];
  const now = Date.now();
  const windowMs = 60_000;
  const key = `copilot:rl:${tenantId}`;

  let timestamps: number[] = [];
  try {
    const raw = await env.CACHE.get(key, 'json');
    if (Array.isArray(raw)) timestamps = raw.filter((t: number) => now - t < windowMs);
  } catch {
    // On cache failure, allow with degraded rate
    return { allowed: true, remainingMs: windowMs, tier, limit };
  }

  if (timestamps.length >= limit) {
    const oldest = Math.min(...timestamps);
    const remainingMs = windowMs - (now - oldest);
    return { allowed: false, remainingMs, tier, limit };
  }

  timestamps.push(now);
  try {
    await env.CACHE.put(key, JSON.stringify(timestamps), { expirationTtl: 120 });
  } catch {
    // Best-effort; proceed even if cache write fails
  }

  return { allowed: true, remainingMs: windowMs, tier, limit };
}

// ──────────────────────────────────────────────
// Timeout wrapper
// ──────────────────────────────────────────────

export function timeout<T>(label: string, ms: number, fn: Promise<T>): Promise<T> {
  return Promise.race([
    fn,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} handler timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ──────────────────────────────────────────────
// Response helpers
// ──────────────────────────────────────────────

export function buildFallbackResponse(query: string): HandlerResult {
  return {
    intent: 'report',
    summary: `❓ *Low-confidence Query*\n\nQuery: "${query}"\n\nTôi chưa hiểu rõ intent. Thử hỏi theo chủ đề:\n• Risk — /ask Cảnh báo rủi ro thị trường?\n• Arb — /ask Có arbitrage nào không?\n• Perf — /ask Hiệu suất chiến lược?\n• Regime — /ask Chế độ thị trường hiện tại?\n• Report — /ask Tóm tắt ngày hôm nay`,
    details: { intent: 'report', confidence: 0.3, reason: 'no_keyword_match' },
    generatedAt: new Date().toISOString(),
  };
}

export function formatMarkdownResponse(result: HandlerResult, confidence: number, intent: IntentType): string {
  let header = `🎯 *Intent: ${intent.toUpperCase()}* (${Math.round(confidence * 100)}%)\n\n`;
  if (intent !== result.intent && confidence < 0.5) {
    header += `⚠️ Low confidence — defaulting to ${result.intent.toUpperCase()}\n\n`;
  }
  return header + result.summary + '\n\n_Menghasilkan: ' + result.generatedAt + '_';
}

// ──────────────────────────────────────────────
// CORS helpers
// ──────────────────────────────────────────────

export function corsHeaders(env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
