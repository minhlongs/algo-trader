/**
 * Master E2E Test Harness Facade
 * Cross-Engine Unified Trading Loop & Execution Bridge
 */

import { MockPriorityQueue, MockConflictResolver } from './fixtures/mock-queue-resolver.fixture';
import { MockSynchronizedRiskGate } from './fixtures/mock-risk-gate.fixture';
import { MockTriModeDispatcher } from './fixtures/mock-sor-dispatcher.fixture';
import { MockTelemetryHub, MockAutonomousLifecycleManager } from './fixtures/mock-telemetry-lifecycle.fixture';
import type {
  UnifiedTradeIntent,
  DispatchResult,
  RiskGateVerdict,
  ResolutionResult,
} from './fixtures/harness-types';

export * from './fixtures/harness-types';
export * from './fixtures/mock-engines.fixture';
export * from './fixtures/mock-queue-resolver.fixture';
export * from './fixtures/mock-risk-gate.fixture';
export * from './fixtures/mock-sor-dispatcher.fixture';
export * from './fixtures/mock-telemetry-lifecycle.fixture';

export class MasterTradingLoopHarness {
  public readonly queue = new MockPriorityQueue(50);
  public readonly resolver = new MockConflictResolver();
  public readonly riskGate = new MockSynchronizedRiskGate();
  public readonly dispatcher = new MockTriModeDispatcher('PAPER');
  public readonly telemetry = new MockTelemetryHub();
  public readonly lifecycle = new MockAutonomousLifecycleManager();

  constructor() {
    this.lifecycle.transitionTo('RUNNING');
  }

  public step(intent: UnifiedTradeIntent): {
    enqueued: boolean;
    verdict: RiskGateVerdict;
    dispatch?: DispatchResult;
    resolution?: ResolutionResult;
  } {
    if (this.lifecycle.getState() !== 'RUNNING') {
      return {
        enqueued: false,
        verdict: {
          approved: false,
          reason: `Loop is in ${this.lifecycle.getState()} state`,
          scaledQuantity: 0,
          originalQuantity: intent.quantity,
          allocatedCapitalUsd: 0,
          currentNavUsd: 100000,
          cashBufferRatio: 0.3,
          grossLeverage: 1.0,
          circuitBreakerTier: 'HALT',
        },
      };
    }

    const enqueued = this.queue.enqueue(intent);
    if (!enqueued) {
      this.telemetry.emitEvent({
        eventType: 'REJECTED',
        orderId: `ord-drop-${intent.intentId}`,
        intentId: intent.intentId,
        engineId: intent.engineId,
        venue: intent.venue,
        mode: this.dispatcher.getMode(),
        quantity: intent.quantity,
      });
      return {
        enqueued: false,
        verdict: {
          approved: false,
          reason: 'Queue backpressure shedding rejected intent',
          scaledQuantity: 0,
          originalQuantity: intent.quantity,
          allocatedCapitalUsd: 0,
          currentNavUsd: 100000,
          cashBufferRatio: 0.3,
          grossLeverage: 1.0,
          circuitBreakerTier: 'NORMAL',
        },
      };
    }

    const verdict = this.riskGate.validateOrder(intent);
    if (!verdict.approved) {
      this.telemetry.emitEvent({
        eventType: 'REJECTED',
        orderId: `ord-risk-${intent.intentId}`,
        intentId: intent.intentId,
        engineId: intent.engineId,
        venue: intent.venue,
        mode: this.dispatcher.getMode(),
        quantity: intent.quantity,
      });
      return { enqueued: true, verdict };
    }

    const orderToDispatch: UnifiedTradeIntent = verdict.scaledQuantity !== intent.quantity
      ? { ...intent, quantity: verdict.scaledQuantity }
      : intent;

    const dispatch = this.dispatcher.dispatch(orderToDispatch);
    this.telemetry.emitEvent({
      eventType: dispatch.status === 'FILLED' ? 'FILLED' : 'PARTIALLY_FILLED',
      orderId: dispatch.orderId,
      intentId: intent.intentId,
      engineId: intent.engineId,
      venue: intent.venue,
      mode: dispatch.mode,
      quantity: dispatch.executedQuantity,
      price: dispatch.averagePrice,
    });

    const pnl = intent.side === 'SELL' ? 15 : -5;
    this.telemetry.ingestFill(intent.engineId, pnl, dispatch.feeUsd);

    return { enqueued: true, verdict, dispatch };
  }
}

export function createMasterLoopHarness(): MasterTradingLoopHarness {
  return new MasterTradingLoopHarness();
}
