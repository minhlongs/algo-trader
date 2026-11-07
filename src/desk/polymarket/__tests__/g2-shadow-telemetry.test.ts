/**
 * Unit tests for G2-Poly-Shadow Cohort Continuation & Version Transition Telemetry (§2.5).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  RECONCILER_STATE_FILE,
  G2_TELEMETRY_FILE,
  MAX_RESTART_GAP_MS,
  saveReconcilerState,
  restoreReconcilerState,
  loadG2ShadowTelemetry,
  resolveGitTelemetryIdentity,
} from '../g2-shadow-telemetry';
import { restoreOrchestratorState } from '../live-trading-state-persistence';
import { PolymarketOrderReconciler } from '../../execution/polymarket-order-reconciler';
import { LiveTradingJournal } from '../../execution/live-trading-journal';
import { LiveExecutionGuard } from '../../execution/live-execution-guard';
import { LivePositionTracker } from '../../execution/live-position-tracker';
import { writeJson } from '../../../shared/persistence/persistent-store';

describe('G2-Poly-Shadow Cohort Continuation & Version Transition Telemetry', () => {
  let stateBackup: string | null = null;
  let telemetryBackup: string | null = null;

  beforeEach(() => {
    stateBackup = fs.existsSync(RECONCILER_STATE_FILE)
      ? fs.readFileSync(RECONCILER_STATE_FILE, 'utf8')
      : null;
    telemetryBackup = fs.existsSync(G2_TELEMETRY_FILE)
      ? fs.readFileSync(G2_TELEMETRY_FILE, 'utf8')
      : null;
  });

  afterEach(() => {
    if (stateBackup !== null) {
      fs.writeFileSync(RECONCILER_STATE_FILE, stateBackup, 'utf8');
    }
    if (telemetryBackup !== null) {
      fs.writeFileSync(G2_TELEMETRY_FILE, telemetryBackup, 'utf8');
    }
  });

  it('resets startedAtMs when gapMs > MAX_RESTART_GAP_MS and allowCohortContinuation is false', () => {
    const reconciler = new PolymarketOrderReconciler(1000);
    const t0 = 1794047000444;
    const saved = saveReconcilerState(reconciler, t0);
    const futureNow = saved.persistedAtMs + MAX_RESTART_GAP_MS + 60_000;

    const target = new PolymarketOrderReconciler(1000);
    const res = restoreReconcilerState(target, {
      nowMs: futureNow,
      allowCohortContinuation: false,
    });

    expect(res.restored).toBe(false);
    expect(res.startedAtMs).toBe(futureNow);
  });

  it('preserves T0_G2 across >15m probe gaps when allowCohortContinuation is true and drift === 0', () => {
    const reconciler = new PolymarketOrderReconciler(1000);
    reconciler.createOrder({
      intentId: 'int-cohort-1',
      orderId: 'ord-cohort-1',
      marketId: 'mkt-1',
      tokenId: 'tok-yes',
      side: 'BUY',
      requestedSize: 10,
      limitPrice: 0.48,
      timestamp: 1794047000500,
    });
    reconciler.applyEvent({
      eventId: 'ev-cohort-1',
      orderId: 'ord-cohort-1',
      type: 'FILLED',
      fillSize: 10,
      fillPrice: 0.48,
      feeUsdc: 0.01,
      timestamp: 1794047000600,
    });

    const t0 = 1794047000444;
    const saved = saveReconcilerState(reconciler, t0);
    const futureNow = saved.persistedAtMs + MAX_RESTART_GAP_MS + 3_600_000;

    const target = new PolymarketOrderReconciler(1000);
    const res = restoreReconcilerState(target, {
      nowMs: futureNow,
      allowCohortContinuation: true,
    });

    expect(res.restored).toBe(true);
    expect(res.continuedPastGap).toBe(true);
    expect(res.startedAtMs).toBe(t0);
    expect(target.reconcile().unexplainedDriftUsdc).toBe(0);
    expect(target.reconcile().unknownOrderCount).toBe(0);
    expect(target.reconcile().positionsByToken['tok-yes']).toBe(10);
  });

  it('fails closed and rolls back snapshot when allowCohortContinuation is true but unknownOrderCount > 0 or drift > 0', () => {
    const reconciler = new PolymarketOrderReconciler(1000);
    reconciler.createOrder({
      intentId: 'int-unknown-1',
      orderId: 'ord-unknown-1',
      marketId: 'mkt-1',
      tokenId: 'tok-yes',
      side: 'BUY',
      requestedSize: 10,
      limitPrice: 0.48,
      timestamp: 1794047000500,
    });
    reconciler.applyEvent({
      eventId: 'ev-unknown-1',
      orderId: 'ord-unknown-1',
      type: 'TIMEOUT_UNKNOWN',
      timestamp: 1794047000600,
    });

    const t0 = 1794047000444;
    const nowMs = Date.now();
    writeJson(RECONCILER_STATE_FILE, {
      startedAtMs: t0,
      persistedAtMs: nowMs - MAX_RESTART_GAP_MS - 120_000,
      snapshot: reconciler.serialize(),
      sourceCommitSha: '0996c20cc144049bc8e49ccbb1a81d1d4a7f1048',
      srcTreeHash: 'f9f4e6527a5d07c3bbcd66f711f719971b7e5330',
    });

    const target = new PolymarketOrderReconciler(1000);
    const res = restoreReconcilerState(target, {
      nowMs,
      allowCohortContinuation: true,
    });

    expect(res.restored).toBe(false);
    expect(res.startedAtMs).toBe(nowMs);
    expect(target.reconcile().unknownOrderCount).toBe(0);
  });

  it('logs a version_transition telemetry marker when commit SHA changes across cohort continuation with zero drift', async () => {
    const t0 = 1794047000444;
    const reconciler = new PolymarketOrderReconciler(1000);
    writeJson(RECONCILER_STATE_FILE, {
      startedAtMs: t0,
      persistedAtMs: Date.now() - MAX_RESTART_GAP_MS - 30_000,
      snapshot: reconciler.serialize(),
      sourceCommitSha: '0000000000000000000000000000000000000001',
      srcTreeHash: '0000000000000000000000000000000000000002',
    });
    fs.writeFileSync(G2_TELEMETRY_FILE, '', 'utf8');

    const targetReconciler = new PolymarketOrderReconciler(1000);
    let capturedStartedAt = 0;
    await restoreOrchestratorState(
      {
        journal: new LiveTradingJournal(),
        guard: new LiveExecutionGuard({ capitalUsdc: 1000 }),
        positionTracker: new LivePositionTracker(),
        reconciler: targetReconciler,
        mode: 'PAPER',
        onStartedAtMs: (ts) => {
          capturedStartedAt = ts;
        },
      },
      { failClosed: false, allowCohortContinuation: true },
    );

    expect(capturedStartedAt).toBe(t0);
    const entries = await loadG2ShadowTelemetry();
    const transition = entries.find((e) => e.event === 'version_transition');
    const currentId = resolveGitTelemetryIdentity();
    expect(transition).toBeDefined();
    expect(transition?.loopStartedAtMs).toBe(t0);
    expect(transition?.versionTransition).toEqual({
      previousCommitSha: '0000000000000000000000000000000000000001',
      currentCommitSha: currentId.sourceCommitSha,
      previousSrcTreeHash: '0000000000000000000000000000000000000002',
      currentSrcTreeHash: currentId.srcTreeHash,
      reason: 'cohort_continuation_zero_drift',
    });
  });
});
