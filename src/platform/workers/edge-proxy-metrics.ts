/**
 * Prometheus metrics endpoint and metric entry ingestion
 * for the edge-proxy worker.
 */

import type { ProbeResult } from '../../regions/latency-monitor';
import type { Env } from './edge-proxy-types';
import { CORS } from './edge-proxy-constants';
import { getRegionHealth } from './edge-proxy-regions';

/** Prometheus metrics endpoint for Cloudflare Workers */
export async function handleMetrics(env: Env): Promise<Response> {
  const health = await getRegionHealth(env);
  const { getLatencyMonitor } = await import('../../regions/latency-monitor');
  const latencyMonitor = getLatencyMonitor();
  latencyMonitor.start();

  const lines: string[] = [];

  // Region health metrics
  for (const h of health) {
    lines.push(`# HELP region_healthy Region health status (1=healthy, 0=unhealthy)`);
    lines.push(`# TYPE region_healthy gauge`);
    lines.push(`region_healthy{region="${h.region}"} ${h.healthy ? 1 : 0}`);

    lines.push(`# HELP region_latency_ms Region p95 latency in milliseconds`);
    lines.push(`# TYPE region_latency_ms gauge`);
    lines.push(`region_latency_ms{region="${h.region}"} ${h.latencyMs.toFixed(2)}`);

    lines.push(`# HELP region_error_rate Region error rate`);
    lines.push(`# TYPE region_error_rate gauge`);
    // Get error rate from latency monitor
    const monitorHealth = latencyMonitor.getHealth(h.region)[0];
    lines.push(`region_error_rate{region="${h.region}"} ${monitorHealth?.errorRate || 0}`);
  }

  // Probes total
  lines.push(`# HELP region_probes_total Total number of latency probes`);
  lines.push(`# TYPE region_probes_total counter`);
  for (const region of ['us-east', 'eu-central', 'ap-southeast']) {
    const count = latencyMonitor.getResults().filter((r: ProbeResult) => r.region === region).length;
    lines.push(`region_probes_total{region="${region}"} ${count}`);
  }

  // Worker info
  lines.push(`# HELP edge_proxy_info Edge proxy information`);
  lines.push(`# TYPE edge_proxy_info gauge`);
  lines.push(`edge_proxy_info{region="${env.ENVIRONMENT}",routing_enabled="${env.REGION_ROUTING_ENABLED || 'true'}"} 1`);

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
}

/** Ingest metric entries into KV */
export async function metricEntry(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { entries?: Array<Record<string, unknown>> };
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const now = new Date().toISOString();
    const out: Array<Record<string, unknown>> = [];

    for (const entry of entries) {
      const record = { ...entry, receivedAt: now, region: env.ENVIRONMENT };
      out.push(record);
      await env.CACHE.put(
        'metric:entry:' + Date.now() + ':' + crypto.randomUUID().split('-')[0],
        JSON.stringify(record),
        { expirationTtl: 600 }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, count: out.length, entries: out }),
      { status: 202, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'metric ingest failed', detail: (err as Error).message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
}
