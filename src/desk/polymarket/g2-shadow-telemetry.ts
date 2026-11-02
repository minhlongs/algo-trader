/**
 * G2-Poly-Shadow Persistence & Telemetry Identity Envelope
 *
 * Persists PolymarketOrderReconciler state + T0_G2 (`startedAtMs`) atomically
 * at `~/.cashclaw/live-reconciler-state.json` (surviving `< 15m` restarts) and
 * appends immutable JSONL telemetry snapshots with Git/tree identity fields to
 * `~/.cashclaw/g2-poly-shadow-telemetry.jsonl`.
 */

import { execFileSync } from 'child_process';
import {
  cashclawPath,
  appendJsonl,
  readJsonl,
  readJsonState,
} from '../../shared/persistence/file-store';
import { writeJson } from '../../shared/persistence/persistent-store';
import type {
  PolymarketOrderReconciler,
  ReconcilerSnapshot,
  ReconciliationSummary,
} from '../execution/polymarket-order-reconciler';
import type { PositionSummary } from '../execution/live-position-tracker';
import type { Leg2DecayStats } from './paper-orderbook-simulator';

export const RECONCILER_STATE_FILE = cashclawPath('live-reconciler-state.json');
export const G2_TELEMETRY_FILE = cashclawPath('g2-poly-shadow-telemetry.jsonl');
export const MAX_RESTART_GAP_MS = 15 * 60 * 1000;

export interface PersistedReconcilerState {
  startedAtMs: number;
  persistedAtMs: number;
  snapshot: ReconcilerSnapshot;
  leg2DecayStats?: Leg2DecayStats;
}

export interface G2ShadowTelemetryEntry {
  observedAtIso: string;
  observedAtMs: number;
  sourceCommitSha: string;
  srcTreeHash: string;
  loopStartedAtMs: number;
  mode: 'PAPER' | 'LIVE';
  event: 'start' | 'tick' | 'fill' | 'stop';
  positionSummary: PositionSummary;
  reconciliationSummary: ReconciliationSummary;
  leg2DecayStats?: Leg2DecayStats;
}

let cachedIdentity: { sourceCommitSha: string; srcTreeHash: string } | null = null;

export function resolveGitTelemetryIdentity(): { sourceCommitSha: string; srcTreeHash: string } {
  if (cachedIdentity) return cachedIdentity;
  try {
    const sourceCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const srcTreeHash = execFileSync('git', ['rev-parse', 'HEAD:src'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    cachedIdentity = {
      sourceCommitSha: sourceCommitSha || 'unknown',
      srcTreeHash: srcTreeHash || 'unknown',
    };
  } catch {
    cachedIdentity = { sourceCommitSha: 'unknown', srcTreeHash: 'unknown' };
  }
  return cachedIdentity;
}

export function saveReconcilerState(
  reconciler: PolymarketOrderReconciler,
  startedAtMs: number,
  leg2DecayStats?: Leg2DecayStats,
): PersistedReconcilerState {
  const state: PersistedReconcilerState = {
    startedAtMs,
    persistedAtMs: Date.now(),
    snapshot: reconciler.serialize(),
    leg2DecayStats,
  };
  writeJson(RECONCILER_STATE_FILE, state);
  return state;
}

export function restoreReconcilerState(
  reconciler: PolymarketOrderReconciler,
  nowMs = Date.now(),
): { startedAtMs: number; restored: boolean; leg2DecayStats?: Leg2DecayStats } {
  const saved = readJsonState<PersistedReconcilerState>(RECONCILER_STATE_FILE);
  if (!saved || !saved.snapshot || typeof saved.startedAtMs !== 'number') {
    return { startedAtMs: nowMs, restored: false };
  }
  const gapMs = Math.max(0, nowMs - (saved.persistedAtMs ?? nowMs));
  if (gapMs > MAX_RESTART_GAP_MS) {
    return { startedAtMs: nowMs, restored: false };
  }
  reconciler.hydrate(saved.snapshot);
  return {
    startedAtMs: saved.startedAtMs,
    restored: true,
    leg2DecayStats: saved.leg2DecayStats,
  };
}

export function appendG2ShadowTelemetry(params: {
  loopStartedAtMs: number;
  mode: 'PAPER' | 'LIVE';
  event: G2ShadowTelemetryEntry['event'];
  positionSummary: PositionSummary;
  reconciliationSummary: ReconciliationSummary;
  leg2DecayStats?: Leg2DecayStats;
  nowMs?: number;
}): G2ShadowTelemetryEntry {
  const observedAtMs = params.nowMs ?? Date.now();
  const observedAtIso = new Date(observedAtMs).toISOString();
  const { sourceCommitSha, srcTreeHash } = resolveGitTelemetryIdentity();
  const entry: G2ShadowTelemetryEntry = {
    observedAtIso,
    observedAtMs,
    sourceCommitSha,
    srcTreeHash,
    loopStartedAtMs: params.loopStartedAtMs,
    mode: params.mode,
    event: params.event,
    positionSummary: params.positionSummary,
    reconciliationSummary: params.reconciliationSummary,
    leg2DecayStats: params.leg2DecayStats,
  };
  appendJsonl(G2_TELEMETRY_FILE, entry);
  return entry;
}

export async function loadG2ShadowTelemetry(): Promise<G2ShadowTelemetryEntry[]> {
  return readJsonl<G2ShadowTelemetryEntry>(G2_TELEMETRY_FILE);
}
