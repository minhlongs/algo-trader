// SPDX-License-Identifier: MIT
/**
 * Behavioral probes for the Open-Core execution steps.
 *
 * Both steps claim enforcement in code rather than configuration: a cloud signal bridge that
 * never lets a paper order touch live capital, and an autonomous daemon that refuses to run live
 * without operator confirmation. Each probe exercises the exported class or function that carries
 * the claim and can return `verified: false` — including the direction that matters most, which is
 * that the guard actually stops the dangerous path.
 *
 * @module desk/opencoresaas2026monetization/step-execution-probes
 */

import { OrderDispatcher } from '../execution/order-dispatcher';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import { fail, ok } from './step-governance-support';
import type { IDeskDaemon } from '../commands/desk-auto-types';
import type { StepProbeResult } from './step-probe-types';

function buyIntent(overrides: Partial<UnifiedTradeIntent> = {}): UnifiedTradeIntent {
  return {
    intentId: 'probe-intent',
    side: 'BUY',
    quantity: 1,
    price: 65000,
    venue: 'cex',
    ...overrides,
  } as UnifiedTradeIntent;
}

/**
 * Step 8 — cloud signal bridge.
 *
 * The bridge's claim is that it emits signals *and* keeps paper trading paper. A bridge that
 * dispatches to live while in PAPER defeats its own purpose, so the probe requires paper mode to
 * leave the live counter untouched, requires the bridge to record what it emitted, and requires
 * an unexecutable quantity to be refused rather than silently filled.
 */
export function probeCloudSignalBridge(): StepProbeResult {
  const dispatcher = new OrderDispatcher({ initialMode: 'PAPER' });

  const result = dispatcher.dispatchOrder(buyIntent());
  if (result.mode !== 'PAPER') {
    return fail('dispatcher did not honour the configured PAPER mode');
  }
  if (dispatcher.getLiveApiCallsCount() !== 0) {
    return fail('PAPER mode reached the live API counter');
  }
  if (dispatcher.getVirtualFillsCount() === 0) {
    return fail('PAPER mode did not record a virtual fill');
  }

  const history = dispatcher.getSignalHistory();
  if (history.length !== 1 || history[0].signalId !== `sig-${result.orderId}`) {
    return fail('bridge did not emit a signal envelope for the dispatched order');
  }

  const rejected = dispatcher.dispatchOrder(buyIntent({ quantity: 0 }));
  if (rejected.status !== 'REJECTED') {
    return fail('a zero-quantity order was not rejected');
  }

  return ok(
    'PAPER dispatch stays virtual, emits a bridge envelope, and refuses a zero-quantity order',
  );
}

/**
 * Step 18 — autonomous 24/7 desk daemon.
 *
 * The daemon's safety claim is fail-closed: live capital must never be risked without operator
 * confirmation. The probe runs the command with the confirmation dependency refused and requires
 * it to abort without starting a daemon, because a gate that runs anyway is the failure this step
 * exists to prevent.
 */
export async function probeDeskDaemonFailClosed(): Promise<StepProbeResult> {
  const { runDeskAuto } = await import('../commands/desk-auto');

  let daemonStarted = false;
  const stubDaemon: IDeskDaemon = {
    config: {} as IDeskDaemon['config'],
    start: async () => {
      daemonStarted = true;
    },
    stop: async () => undefined,
    isRunning: () => daemonStarted,
    getStatus: () => ({ started: daemonStarted }),
  };
  const deps = { daemon: stubDaemon, promptConfirm: async () => false };

  try {
    // dryRun defaults to true, so the live gate is only reachable with it explicitly off — that is
    // the configuration the probe must exercise.
    await runDeskAuto({ mode: 'LIVE', dryRun: false, durationSeconds: 1 }, deps);
    return fail('LIVE mode ran without operator confirmation');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/confirm/i.test(message)) {
      return fail(`aborted for the wrong reason: ${message.slice(0, 80)}`);
    }
  }

  if (daemonStarted) {
    return fail('daemon started even though confirmation was declined');
  }

  return ok('LIVE execution aborts without operator confirmation and never starts the daemon');
}
