import { KVNamespace, D1Database } from '@cloudflare/workers-types';

interface Stats {
  trades: number;
  batches: number;
  edge_avg_pct: number;
  actionable_pct: number;
  last_updated: string;
  source: string;
  note: string;
}

const CACHE_TTL = 300; // 5 minutes
const ACTIONABLE_THRESHOLD = 0.05; // 5% edge threshold

export default {
  async fetch(
    request: Request,
    env: { STATS_DB: D1Database; CACHE: KVNamespace },
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const cacheKey = 'stats:paper:v1';
    const cached = await env.CACHE.get(cacheKey, 'json');

    if (cached) {
      return jsonResponse(cached);
    }

    try {
      if (!env.STATS_DB) {
        throw new Error('STATS_DB binding not available');
      }

      const res = await env.STATS_DB.prepare(
        `SELECT
          COUNT(*) AS trades,
          COUNT(DISTINCT strategy) AS batches,
          COALESCE(AVG(edge), 0) * 100 AS edge_avg_pct,
          COALESCE(
            100.0 * SUM(CASE WHEN ABS(edge) >= ?1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
            0
          ) AS actionable_pct,
          COALESCE(MAX(timestamp), '—') AS last_updated
         FROM paper_trades`
      ).bind(ACTIONABLE_THRESHOLD).all<Stats>();

      const row = res.results?.[0] ?? {};
      const stats: Stats = {
        trades: Number((row as any).trades ?? 0),
        batches: Number((row as any).batches ?? 0),
        edge_avg_pct: Math.round((Number((row as any).edge_avg_pct) || 0) * 10) / 10,
        actionable_pct: Math.round((Number((row as any).actionable_pct) || 0) * 10) / 10,
        last_updated: String((row as any).last_updated ?? '—'),
        source: 'live-d1',
        note: 'pre-resolution edge, not profit',
      };

      await env.CACHE.put(cacheKey, JSON.stringify(stats), { expirationTtl: CACHE_TTL });
      return jsonResponse(stats);
    } catch (error) {
      console.warn('D1 query failed, using fallback:', error);
      return jsonResponse({
        trades: 0,
        batches: 0,
        edge_avg_pct: 0,
        actionable_pct: 0,
        last_updated: '—',
        source: 'd1-error',
        note: error instanceof Error ? error.message : 'unknown',
      });
    }
  },
};

function jsonResponse(data: any, init: ResponseInit = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...(init.headers || {}),
  });
  return new Response(JSON.stringify(data), { ...init, headers });
}
