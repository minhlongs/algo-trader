/**
 * Research-Informed Prioritization
 *
 * Pure ranking module. Zero fs. Ranks strategy families based on their prior
 * verdict history (from the research ledger) and the chosen prioritization
 * policy.
 */

import type { StrategyFamilyRegistry } from './strategy-family-types';
import type { VerdictSummary } from '../provenance/verdict-summary';

// ── Types ────────────────────────────────────────────────────────────────────

export type PrioritizationPolicy =
  | 'explore-first'
  | 'retest-failed'
  | 'validated-last';

export interface PrioritizeOptions {
  policy?: PrioritizationPolicy;
}

export interface PrioritizedFamily {
  familyId: string;
  rank: number;
  reason:
    | 'never-tested'
    | 'failed-verdict'
    | 'passed-demoted'
    | 'no-verdict-data';
}

// ── Reason Ranking ───────────────────────────────────────────────────────────

/**
 * Maps each reason to a numeric weight (lower = higher priority) per policy.
 * When no verdict data exists, all families get 'no-verdict-data' and are
 * returned in stable (registry.list) order.
 */
const REASON_PRIORITY: Record<PrioritizationPolicy, Record<string, number>> = {
  'explore-first': {
    'never-tested': 0,
    'failed-verdict': 1,
    'no-verdict-data': 2,
    'passed-demoted': 3,
  },
  'retest-failed': {
    'failed-verdict': 0,
    'never-tested': 1,
    'no-verdict-data': 2,
    'passed-demoted': 3,
  },
  'validated-last': {
    'passed-demoted': 0,
    'no-verdict-data': 1,
    'never-tested': 2,
    'failed-verdict': 3,
  },
};

// ── Classification ───────────────────────────────────────────────────────────

function classifyFamily(
  familyId: string,
  summary: VerdictSummary,
):
  | 'never-tested'
  | 'failed-verdict'
  | 'passed-demoted'
  | 'no-verdict-data' {
  // No ledger records at all — everyone is no-verdict-data.
  if (summary.totalRecords === 0) return 'no-verdict-data';

  const entry = summary.byStrategy[familyId];
  if (!entry) return 'never-tested';
  if (entry.passRate > 0 && entry.lastVerdictPassed) return 'passed-demoted';
  return 'failed-verdict';
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Prioritize strategy families by prior verdicts.
 *
 * Ranking logic:
 * - `explore-first` (default): never-tested > failed > no-data > passed
 * - `retest-failed`: failed > never-tested > no-data > passed
 * - `validated-last`: passed > no-data > never-tested > failed
 *
 * When no ledger records exist (empty summary), all families get
 * `reason: 'no-verdict-data'` and are returned in registry.list() order
 * (stable, deterministic).
 */
export function prioritizeFamilies(
  registry: StrategyFamilyRegistry,
  summary: VerdictSummary,
  opts?: PrioritizeOptions,
): PrioritizedFamily[] {
  const policy = opts?.policy ?? 'explore-first';
  const priorities = REASON_PRIORITY[policy];
  const families = registry.list();

  const classified = families.map((family) => ({
    family,
    reason: classifyFamily(family.id, summary),
  }));

  // Stable sort: use original index as tiebreaker for determinism.
  const indexed = classified.map((item, idx) => ({ ...item, idx }));

  indexed.sort((a, b) => {
    const pa = priorities[a.reason] ?? 99;
    const pb = priorities[b.reason] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.idx - b.idx; // stable: preserve registry order on tie
  });

  return indexed.map((item, rank) => ({
    familyId: item.family.id,
    rank: rank + 1,
    reason: item.reason,
  }));
}
