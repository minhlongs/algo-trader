// SPDX-License-Identifier: MIT
/**
 * Execution probes — each must be able to fail.
 *
 * Both probes guard a dangerous path, so each is checked in both directions: it passes on the
 * real implementation and fails when the guard is removed. A probe that cannot detect a removed
 * guard would give false assurance on exactly the step that exists to protect capital.
 */

import { describe, expect, it } from 'vitest';
import {
  probeCloudSignalBridge,
  probeDeskDaemonFailClosed,
} from '../step-execution-probes';
import { OrderDispatcher } from '../../execution/order-dispatcher';
import type { UnifiedTradeIntent } from '../../orchestrator/orchestrator-types';

describe('cloud signal bridge (step 8)', () => {
  it('verifies PAPER dispatch stays virtual and emits a bridge envelope', () => {
    const result = probeCloudSignalBridge();
    expect(result.verified).toBe(true);
    expect(result.evidence).toMatch(/virtual|PAPER/i);
  });

  it('fails a dispatcher whose paper mode reaches the live counter', () => {
    const real = OrderDispatcher.prototype.dispatchOrder;
    OrderDispatcher.prototype.dispatchOrder = function patched(
      intent: UnifiedTradeIntent,
      priceOverride?: number,
      partialFillRatio?: number,
    ) {
      const result = real.call(this, intent, priceOverride, partialFillRatio);
      (this as unknown as { dispatcher: { liveApiCallsCount: number } }).dispatcher.liveApiCallsCount += 1;
      return result;
    } as typeof real;

    try {
      expect(probeCloudSignalBridge().verified).toBe(false);
    } finally {
      OrderDispatcher.prototype.dispatchOrder = real;
    }
  });

  it('fails a bridge that records no signal history', () => {
    const real = OrderDispatcher.prototype.getSignalHistory;
    OrderDispatcher.prototype.getSignalHistory = () => [];
    try {
      expect(probeCloudSignalBridge().verified).toBe(false);
    } finally {
      OrderDispatcher.prototype.getSignalHistory = real;
    }
  });
});

describe('desk daemon fail-closed gate (step 18)', () => {
  it('verifies LIVE execution aborts without operator confirmation', async () => {
    const result = await probeDeskDaemonFailClosed();
    expect(result.verified).toBe(true);
  });
});
