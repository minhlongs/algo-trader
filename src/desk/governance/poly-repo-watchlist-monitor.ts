/**
 * Weekly Polymarket Ecosystem & Upstream Watchlist Monitor (IC Report Agent #8, pp. 50–51).
 *
 * Tracks the 10 canonical upstream Polymarket & sidecar GitHub repositories from the
 * IC Resolution (CLOB V2 SDKs, CTF/NegRisk contracts, Safe relayer, `poly-book`,
 * `GhostGuard`, UMA oracle, and order-utils) with deterministic offline diffing
 * and optional unauthenticated/read-only GitHub REST polling.
 */

export type WatchlistCategory =
  | 'clob-sdk'
  | 'settlement-contracts'
  | 'relayer'
  | 'sidecar-l2'
  | 'sidecar-ghostguard'
  | 'oracle';

export interface WatchlistRepoEntry {
  readonly slug: string;
  readonly category: WatchlistRepoCategory;
  readonly criticalImpact: string;
}

export type WatchlistRepoCategory = WatchlistCategory;

/** The 10 canonical Polymarket & sidecar repositories mandated by IC Agent #8. */
export const POLYMARKET_UPSTREAM_WATCHLIST: readonly WatchlistRepoEntry[] = Object.freeze([
  { slug: 'Polymarket/clob-client', category: 'clob-sdk', criticalImpact: 'TypeScript CLOB V2 client, EIP-712 signing, heartbeats, order-scoring' },
  { slug: 'Polymarket/rs-clob-client', category: 'clob-sdk', criticalImpact: 'Rust CLOB V2 reference types, fixed-point rounding, V2 wire changes' },
  { slug: 'Polymarket/py-clob-client', category: 'clob-sdk', criticalImpact: 'Canonical CLOB V2 REST endpoints, fee-rate & post-only semantics' },
  { slug: 'Polymarket/ctf-exchange', category: 'settlement-contracts', criticalImpact: 'CTF Exchange fill settlement, FeeModule V2, maker rebate formulas' },
  { slug: 'Polymarket/neg-risk-ctf-adapter', category: 'settlement-contracts', criticalImpact: 'NegRiskAdapter convertPositions, WrappedCollateral / pUSD merge' },
  { slug: 'Polymarket/relay-client', category: 'relayer', criticalImpact: 'Safe/Poly1271 gasless relayer batching & rate limits' },
  { slug: 'Polymarket/go-order-utils', category: 'clob-sdk', criticalImpact: 'EIP-712 Order struct domain separator & signatureType constants' },
  { slug: 'UMAprotocol/protocol', category: 'oracle', criticalImpact: 'Optimistic Oracle V2/V3 dispute bonds, liveness windows, resolution risk' },
  { slug: 'weiminglong/poly-book', category: 'sidecar-l2', criticalImpact: 'Rust fixed-point L2 book, CRC32C WAL v3 & Zstd Parquet capture' },
  { slug: 'OrderBookTrade/GhostGuard', category: 'sidecar-ghostguard', criticalImpact: 'Polygon status=0 TRANSFER_FROM_FAILED Ghost Fill sentinel' },
]);

export interface RepoRemoteState {
  readonly slug: string;
  readonly latestTag: string | null;
  readonly headSha: string | null;
  readonly pushedAtIso: string | null;
}

export interface WatchlistDriftItem {
  readonly slug: string;
  readonly category: WatchlistCategory;
  readonly changeKind: 'NEW_RELEASE_TAG' | 'HEAD_SHA_DRIFT' | 'UNCHANGED' | 'UNREACHABLE';
  readonly baselineTag: string | null;
  readonly latestTag: string | null;
  readonly baselineSha: string | null;
  readonly headSha: string | null;
  readonly criticalImpact: string;
}

export interface WatchlistEvaluationReport {
  readonly evaluatedAtIso: string;
  readonly repoCount: number;
  readonly driftCount: number;
  readonly unreachableCount: number;
  readonly items: readonly WatchlistDriftItem[];
}

export function diffWatchlistSnapshots(
  baselineBySlug: ReadonlyMap<string, RepoRemoteState>,
  observedBySlug: ReadonlyMap<string, RepoRemoteState>,
  watchlist: readonly WatchlistRepoEntry[] = POLYMARKET_UPSTREAM_WATCHLIST,
  nowIso = new Date().toISOString(),
): WatchlistEvaluationReport {
  const items: WatchlistDriftItem[] = [];
  let driftCount = 0;
  let unreachableCount = 0;

  for (const entry of watchlist) {
    const base = baselineBySlug.get(entry.slug);
    const obs = observedBySlug.get(entry.slug);
    if (!obs || (obs.headSha === null && obs.latestTag === null)) {
      unreachableCount += 1;
      items.push({
        slug: entry.slug,
        category: entry.category,
        changeKind: 'UNREACHABLE',
        baselineTag: base?.latestTag ?? null,
        latestTag: null,
        baselineSha: base?.headSha ?? null,
        headSha: null,
        criticalImpact: entry.criticalImpact,
      });
      continue;
    }

    let changeKind: WatchlistDriftItem['changeKind'] = 'UNCHANGED';
    if (base && obs.latestTag !== null && obs.latestTag !== base.latestTag) {
      changeKind = 'NEW_RELEASE_TAG';
      driftCount += 1;
    } else if (base && obs.headSha !== null && base.headSha !== null && obs.headSha !== base.headSha) {
      changeKind = 'HEAD_SHA_DRIFT';
      driftCount += 1;
    }

    items.push({
      slug: entry.slug,
      category: entry.category,
      changeKind,
      baselineTag: base?.latestTag ?? null,
      latestTag: obs.latestTag,
      baselineSha: base?.headSha ?? null,
      headSha: obs.headSha,
      criticalImpact: entry.criticalImpact,
    });
  }

  return {
    evaluatedAtIso: nowIso,
    repoCount: watchlist.length,
    driftCount,
    unreachableCount,
    items,
  };
}

export async function fetchGitHubWatchlistStates(
  watchlist: readonly WatchlistRepoEntry[] = POLYMARKET_UPSTREAM_WATCHLIST,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 5_000,
): Promise<Map<string, RepoRemoteState>> {
  const result = new Map<string, RepoRemoteState>();
  await Promise.all(
    watchlist.map(async (entry) => {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.slug)) {
        result.set(entry.slug, { slug: entry.slug, latestTag: null, headSha: null, pushedAtIso: null });
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = { accept: 'application/vnd.github+json', 'user-agent': 'algo-trader-poly-watchlist' };
        const [repoRes, relRes] = await Promise.all([
          fetchFn(`https://api.github.com/repos/${entry.slug}`, { headers, signal: controller.signal }),
          fetchFn(`https://api.github.com/repos/${entry.slug}/releases/latest`, { headers, signal: controller.signal }),
        ]);
        const repoJson = repoRes.ok ? ((await repoRes.json()) as { pushed_at?: string; default_branch?: string }) : null;
        const relJson = relRes.ok ? ((await relRes.json()) as { tag_name?: string; target_commitish?: string }) : null;
        result.set(entry.slug, {
          slug: entry.slug,
          latestTag: typeof relJson?.tag_name === 'string' ? relJson.tag_name : null,
          headSha: typeof relJson?.target_commitish === 'string' ? relJson.target_commitish : (repoJson?.default_branch ?? null),
          pushedAtIso: typeof repoJson?.pushed_at === 'string' ? repoJson.pushed_at : null,
        });
      } catch {
        result.set(entry.slug, { slug: entry.slug, latestTag: null, headSha: null, pushedAtIso: null });
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return result;
}
