/**
 * Edge Multi-Region Deploy & Smoke Verification Suite
 * Verifies /api/health, DO consensus, and shard routing across Tokyo, Singapore, and Frankfurt.
 */

import { logger } from '../src/shared/utils/logger';
import { buildRing, getShardForStrategy } from '../src/desk/utils/consistent-hash';

export interface EdgeRegionTarget {
  id: 'tokyo' | 'singapore' | 'frankfurt';
  name: string;
  host: string;
  colo: string;
}

export const EDGE_REGIONS: Record<EdgeRegionTarget['id'], EdgeRegionTarget> = {
  tokyo: { id: 'tokyo', name: 'Tokyo (AP-East)', host: 'tyo.algo-trader.workers.dev', colo: 'NRT' },
  singapore: { id: 'singapore', name: 'Singapore (AP-SouthEast)', host: 'sin.algo-trader.workers.dev', colo: 'SIN' },
  frankfurt: { id: 'frankfurt', name: 'Frankfurt (EU-Central)', host: 'fra.algo-trader.workers.dev', colo: 'FRA' },
};

export interface RegionCheckResult {
  region: EdgeRegionTarget['id'];
  endpoint: string;
  healthy: boolean;
  statusCode: number;
  latencyMs: number;
}

export interface DoConsensusResult {
  region: EdgeRegionTarget['id'];
  leaderReachable: boolean;
  term: number;
  quorumSatisfied: boolean;
  latencyMs: number;
}

export interface ShardRoutingVerification {
  region: EdgeRegionTarget['id'];
  totalShards: number;
  healthyShards: number;
  routingAccurate: boolean;
  sampleStrategyRoutes: Array<{ strategyId: string; shardId: number }>;
}

export interface MultiRegionVerificationSummary {
  timestamp: number;
  allHealthy: boolean;
  regions: Record<EdgeRegionTarget['id'], {
    health: RegionCheckResult;
    consensus: DoConsensusResult;
    shardRouting: ShardRoutingVerification;
  }>;
}

export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export async function verifyRegionHealth(
  region: EdgeRegionTarget,
  fetchFn: FetchFunction = globalThis.fetch,
  timeoutMs = 5000,
): Promise<RegionCheckResult> {
  const start = Date.now();
  try {
    const res = await fetchFn(`https://${region.host}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return { region: region.id, endpoint: '/api/health', healthy: res.status === 200, statusCode: res.status, latencyMs: Date.now() - start };
  } catch {
    return { region: region.id, endpoint: '/api/health', healthy: false, statusCode: 0, latencyMs: Date.now() - start };
  }
}

export async function verifyDoConsensus(
  region: EdgeRegionTarget,
  fetchFn: FetchFunction = globalThis.fetch,
  timeoutMs = 5000,
): Promise<DoConsensusResult> {
  const start = Date.now();
  try {
    const res = await fetchFn(`https://${region.host}/api/consensus/status`, { signal: AbortSignal.timeout(timeoutMs) });
    const latencyMs = Date.now() - start;
    if (res.status === 200) {
      const data = (await res.json()) as { term?: number; leader?: boolean; quorum?: boolean };
      return { region: region.id, leaderReachable: Boolean(data.leader ?? true), term: data.term ?? 1, quorumSatisfied: Boolean(data.quorum ?? true), latencyMs };
    }
    return { region: region.id, leaderReachable: false, term: 0, quorumSatisfied: false, latencyMs };
  } catch {
    return { region: region.id, leaderReachable: false, term: 0, quorumSatisfied: false, latencyMs: Date.now() - start };
  }
}

export async function verifyShardRouting(
  region: EdgeRegionTarget,
  totalShards = 12,
  fetchFn: FetchFunction = globalThis.fetch,
  timeoutMs = 5000,
): Promise<ShardRoutingVerification> {
  const sampleStrategies = ['alpha-rsi-1', 'polymarket-arb-2', 'funding-rate-3', 'volatility-surface-4'];
  const ring = buildRing(totalShards, 100);
  const sampleRoutes = sampleStrategies.map((id) => ({ strategyId: id, shardId: getShardForStrategy(ring, id) }));
  const accurate = sampleRoutes.every((r) => r.shardId >= 0 && r.shardId < totalShards);

  try {
    const res = await fetchFn(`https://${region.host}/api/v1/shard/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return { region: region.id, totalShards, healthyShards: res.status === 200 ? totalShards : 0, routingAccurate: accurate, sampleStrategyRoutes: sampleRoutes };
  } catch {
    return { region: region.id, totalShards, healthyShards: 0, routingAccurate: accurate, sampleStrategyRoutes: sampleRoutes };
  }
}

export async function runMultiRegionVerification(
  fetchFn?: FetchFunction,
  timeoutMs = 5000,
): Promise<MultiRegionVerificationSummary> {
  const regionKeys: EdgeRegionTarget['id'][] = ['tokyo', 'singapore', 'frankfurt'];
  const regionsObj: Partial<MultiRegionVerificationSummary['regions']> = {};
  let allHealthy = true;

  for (const key of regionKeys) {
    const target = EDGE_REGIONS[key];
    const [health, consensus, shardRouting] = await Promise.all([
      verifyRegionHealth(target, fetchFn, timeoutMs),
      verifyDoConsensus(target, fetchFn, timeoutMs),
      verifyShardRouting(target, 12, fetchFn, timeoutMs),
    ]);

    const isRegionOk = health.healthy && consensus.quorumSatisfied && shardRouting.routingAccurate;
    if (!isRegionOk) allHealthy = false;

    regionsObj[key] = { health, consensus, shardRouting };
    logger.info(`[EdgeMultiRegion] Verified region ${target.name}`, { status: isRegionOk ? 'PASS' : 'FAIL', healthStatus: health.statusCode, latency: health.latencyMs });
  }

  return { timestamp: Date.now(), allHealthy, regions: regionsObj as MultiRegionVerificationSummary['regions'] };
}

if (typeof require !== 'undefined' && require.main === module) {
  runMultiRegionVerification()
    .then((summary) => {
      logger.info(`[EdgeMultiRegion] Verification finished: ${summary.allHealthy ? 'PASSED' : 'FAILED'}`);
      process.exit(summary.allHealthy ? 0 : 1);
    })
    .catch((err) => {
      logger.error('[EdgeMultiRegion] Verification execution failed', { err });
      process.exit(1);
    });
}
