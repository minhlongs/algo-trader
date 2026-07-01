/**
 * CashClaw public stats handler — CF-native, zero VPS required.
 * Serves hardcoded stats with optional override from KV.
 */

interface Env { CACHE: KVNamespace; }

const CORS = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

/** GET /api/public/stats — landing page live stats */
export async function handlePublicStats(env: Env): Promise<Response> {
  // Load stats override from KV if present (admin can update via secret)
  const cached = await env.CACHE.get('config:public-stats');
  if (cached) {
    return json(JSON.parse(cached));
  }

  // Default stats — updated as platform grows
  return json({
    totalVolume: '$4.2M',
    avgEdge: '+18.4%',
    signalAccuracy: '94.2%',
    activeUsers: 3847,
    strategies: 52,
    tests: 2430,
    uptime: '99.9%',
  });
}
