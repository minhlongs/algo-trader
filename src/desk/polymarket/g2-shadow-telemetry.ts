/**
 * G2-Poly-Shadow Persistence & Telemetry Identity Envelope
 *
 * Persists PolymarketOrderReconciler state + T0_G2 (`startedAtMs`) atomically
 * at `~/.cashclaw/live-reconciler-state.json` and appends immutable JSONL
 * telemetry snapshots + Version Transition Markers (`§2.5`).
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { cashclawPath, appendJsonl, readJsonl, readJsonState } from '../../shared/persistence/file-store';
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

export interface VersionTransitionMetadata {
  previousCommitSha: string;
  currentCommitSha: string;
  previousSrcTreeHash: string;
  currentSrcTreeHash: string;
  reason: string;
}

export interface PersistedReconcilerState {
  startedAtMs: number;
  persistedAtMs: number;
  snapshot: ReconcilerSnapshot;
  leg2DecayStats?: Leg2DecayStats;
  sourceCommitSha?: string;
  srcTreeHash?: string;
}

export interface RestoreReconcilerOptions {
  nowMs?: number;
  allowCohortContinuation?: boolean;
}

export interface RestoreReconcilerResult {
  startedAtMs: number;
  restored: boolean;
  continuedPastGap?: boolean;
  leg2DecayStats?: Leg2DecayStats;
  previousCommitSha?: string;
  previousSrcTreeHash?: string;
}

export interface G2ShadowTelemetryEntry {
  observedAtIso: string;
  observedAtMs: number;
  sourceCommitSha: string;
  srcTreeHash: string;
  loopStartedAtMs: number;
  mode: 'PAPER' | 'LIVE';
  event: 'start' | 'tick' | 'fill' | 'stop' | 'version_transition';
  positionSummary: PositionSummary;
  reconciliationSummary: ReconciliationSummary;
  leg2DecayStats?: Leg2DecayStats;
  versionTransition?: VersionTransitionMetadata;
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

function readLastPersistedTelemetryIdentity(): { sourceCommitSha?: string; srcTreeHash?: string } {
  try {
    if (!fs.existsSync(G2_TELEMETRY_FILE)) return {};
    const lines = fs.readFileSync(G2_TELEMETRY_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1];
    if (!lastLine) return {};
    const parsed = JSON.parse(lastLine) as Partial<G2ShadowTelemetryEntry>;
    return { sourceCommitSha: parsed.sourceCommitSha, srcTreeHash: parsed.srcTreeHash };
  } catch {
    return {};
  }
}

export function saveReconcilerState(
  reconciler: PolymarketOrderReconciler,
  startedAtMs: number,
  leg2DecayStats?: Leg2DecayStats,
): PersistedReconcilerState {
  const { sourceCommitSha, srcTreeHash } = resolveGitTelemetryIdentity();
  const state: PersistedReconcilerState = {
    startedAtMs,
    persistedAtMs: Date.now(),
    snapshot: reconciler.serialize(),
    leg2DecayStats,
    sourceCommitSha,
    srcTreeHash,
  };
  writeJson(RECONCILER_STATE_FILE, state);
  return state;
}

export function restoreReconcilerState(
  reconciler: PolymarketOrderReconciler,
  nowOrOptions: number | RestoreReconcilerOptions = Date.now(),
  extraOptions?: RestoreReconcilerOptions,
): RestoreReconcilerResult {
  const nowMs = typeof nowOrOptions === 'number' ? nowOrOptions : (nowOrOptions.nowMs ?? Date.now());
  const allowCohortContinuation =
    typeof nowOrOptions === 'object' ? Boolean(nowOrOptions.allowCohortContinuation) : Boolean(extraOptions?.allowCohortContinuation);

  const saved = readJsonState<PersistedReconcilerState>(RECONCILER_STATE_FILE);
  if (!saved || !saved.snapshot || typeof saved.startedAtMs !== 'number') {
    return { startedAtMs: nowMs, restored: false };
  }
  const gapMs = Math.max(0, nowMs - (saved.persistedAtMs ?? nowMs));
  if (gapMs > MAX_RESTART_GAP_MS && !allowCohortContinuation) {
    return { startedAtMs: nowMs, restored: false };
  }
  const cleanSnapshot = reconciler.serialize();
  reconciler.hydrate(saved.snapshot);
  if (gapMs > MAX_RESTART_GAP_MS && allowCohortContinuation) {
    const check = reconciler.reconcile();
    if (Math.abs(check.unexplainedDriftUsdc) > 1e-6 || check.unknownOrderCount > 0) {
      reconciler.hydrate(cleanSnapshot);
      return { startedAtMs: nowMs, restored: false };
    }
  }
  const fb = !saved.sourceCommitSha || !saved.srcTreeHash ? readLastPersistedTelemetryIdentity() : {};
  return {
    startedAtMs: saved.startedAtMs,
    restored: true,
    continuedPastGap: gapMs > MAX_RESTART_GAP_MS,
    leg2DecayStats: saved.leg2DecayStats,
    previousCommitSha: saved.sourceCommitSha ?? fb.sourceCommitSha,
    previousSrcTreeHash: saved.srcTreeHash ?? fb.srcTreeHash,
  };
}

export function appendG2ShadowTelemetry(params: {
  loopStartedAtMs: number;
  mode: 'PAPER' | 'LIVE';
  event: G2ShadowTelemetryEntry['event'];
  positionSummary: PositionSummary;
  reconciliationSummary: ReconciliationSummary;
  leg2DecayStats?: Leg2DecayStats;
  versionTransition?: VersionTransitionMetadata;
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
    ...(params.versionTransition ? { versionTransition: params.versionTransition } : {}),
  };
  appendJsonl(G2_TELEMETRY_FILE, entry);
  return entry;
}

export async function loadG2ShadowTelemetry(): Promise<G2ShadowTelemetryEntry[]> {
  return readJsonl<G2ShadowTelemetryEntry>(G2_TELEMETRY_FILE);
}
