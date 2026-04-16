/**
 * Pages Function: GET /api/stats
 * Returns live aggregates from D1 mirror of paper_trades_v3.
 * KV cache 5 min TTL. Falls back to empty payload if D1 unbound (dev).
 */

interface Env {
  STATS_DB?: D1Database;
  CACHE?: KVNamespace;
}

interface StatsPayload {
  trades: number;
  batches: number;
  edge_avg_pct: number;
  actionable_pct: number;
  last_updated: string;
  source: string;
  note: string;
}

const CACHE_KEY = 'stats:paper:v1';
const CACHE_TTL = 300;
const ACTIONABLE_THRESHOLD = 0.05;

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, max-age=60',
  'access-control-allow-origin': '*',
};

const NO_CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
};

async function queryStats(db: D1Database): Promise<StatsPayload> {
  const res = await db
    .prepare(
      `SELECT
        COUNT(*) AS trades,
        COUNT(DISTINCT strategy) AS batches,
        COALESCE(AVG(edge), 0) * 100 AS edge_avg_pct,
        COALESCE(
          100.0 * SUM(CASE WHEN ABS(edge) >= ?1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
          0
        ) AS actionable_pct,
        COALESCE(MAX(timestamp), '—') AS last_updated
      FROM paper_trades`,
    )
    .bind(ACTIONABLE_THRESHOLD)
    .all();

  const row = res.results[0] ?? {};
  return {
    trades: Number((row as Record<string, unknown>).trades ?? 0),
    batches: Number((row as Record<string, unknown>).batches ?? 0),
    edge_avg_pct: Math.round((Number((row as Record<string, unknown>).edge_avg_pct) || 0) * 10) / 10,
    actionable_pct: Math.round((Number((row as Record<string, unknown>).actionable_pct) || 0) * 10) / 10,
    last_updated: String((row as Record<string, unknown>).last_updated ?? '—'),
    source: 'live-d1',
    note: 'pre-resolution edge, not profit',
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.STATS_DB) {
    return new Response(
      JSON.stringify({
        trades: 0, batches: 0, edge_avg_pct: 0, actionable_pct: 0,
        last_updated: '—', source: 'd1-unbound', note: 'D1 binding missing',
      }),
      { status: 200, headers: NO_CACHE_HEADERS },
    );
  }

  if (env.CACHE) {
    const cached = await env.CACHE.get(CACHE_KEY);
    if (cached) {
      return new Response(cached, { headers: { ...HEADERS, 'x-cache': 'HIT' } });
    }
  }

  try {
    const payload = await queryStats(env.STATS_DB);
    const body = JSON.stringify(payload);
    if (env.CACHE) {
      await env.CACHE.put(CACHE_KEY, body, { expirationTtl: CACHE_TTL });
    }
    return new Response(body, { headers: { ...HEADERS, 'x-cache': 'MISS' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(
      JSON.stringify({
        trades: 0, batches: 0, edge_avg_pct: 0, actionable_pct: 0,
        last_updated: '—', source: 'd1-error', note: message,
      }),
      { status: 200, headers: NO_CACHE_HEADERS },
    );
  }
};
