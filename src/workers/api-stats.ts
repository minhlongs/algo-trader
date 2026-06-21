/**
 * API Stats Handler — returns aggregated paper trading statistics from D1.
 * Endpoint: GET /api/stats
 * Returns: { trades, batches, edge_avg_pct, actionable_pct, last_updated, source, note }
 *
 * Note: batches is computed as count of distinct trading days (date(timestamp))
 * because the paper_trades table does not have an explicit batch_id column.
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

interface PaperStats {
  trades: number;
  batches: number;
  edge_avg_pct: number;
  actionable_pct: number;
  last_updated: string;
  source: string;
  note: string;
}

const CACHE_KEY = 'stats:latest';
const CACHE_TTL = 300; // 5 minutes in seconds

export async function handleStats(env: { STATS_DB: D1Database; CACHE: KVNamespace }): Promise<Response> {
  // Try cache first
  const cached = await env.CACHE.get(CACHE_KEY);
  if (cached) {
    const json = cached as string;
    // Validate JSON structure minimally
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed.trades === 'number') {
        return new Response(json, {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        });
      }
    } catch {
      // fall through to recompute
    }
  }

  try {
    const result = await env.STATS_DB.prepare(
      `SELECT
         COUNT(*) as trades,
         COUNT(DISTINCT date(timestamp)) as batches,
         AVG(edge) * 100 as edge_avg_pct,
         AVG(CASE WHEN ABS(edge) >= 0.05 THEN 1.0 ELSE 0.0 END) * 100 as actionable_pct
       FROM paper_trades`
    ).all();

    const row = result.results[0] as Record<string, number> | undefined;

    let stats: PaperStats;
    if (!row || row.trades === 0) {
      stats = {
        trades: 0,
        batches: 0,
        edge_avg_pct: 0,
        actionable_pct: 0,
        last_updated: new Date().toISOString().slice(0, 10),
        source: 'd1-empty',
        note: 'No paper trades synced yet',
      };
    } else {
      stats = {
        trades: row.trades || 0,
        batches: row.batches || 0,
        edge_avg_pct: Number((row.edge_avg_pct || 0).toFixed(1)),
        actionable_pct: Math.round(row.actionable_pct || 0),
        last_updated: new Date().toISOString().slice(0, 10),
        source: 'd1',
        note: 'Live mirror; pre-resolution edge, not profit',
      };
    }

    const json = JSON.stringify(stats);
    // Cache for 5 minutes
    await env.CACHE.put(CACHE_KEY, json, { expirationTtl: CACHE_TTL });

    return new Response(json, {
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('[api-stats] query failed', error);
    return new Response(JSON.stringify({ error: 'stats_unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
