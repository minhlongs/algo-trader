/**
 * Unified Master Trading Loop (Milestone 5 - AC)
 * Master orchestrator connecting all 4 engines, queue, risk gate, dispatcher, and telemetry.
 */

import { PrioritySignalQueue } from './priority-signal-queue';
import { ConflictResolver } from './conflict-resolver';
import { InternalCrossingEngine } from './internal-crossing-engine';
import { SynchronizedRiskGate } from './synchronized-risk-gate';
import type { RiskGateVerdict } from './risk-gate-types';
import { TriModeDispatcher } from '../execution/tri-mode-dispatcher';
import type { DispatchResult, TriMode } from '../execution/tri-mode-types';
import { AutonomousLifecycleManager } from './autonomous-lifecycle-manager';
import type { AutonomousLifecycleState } from './autonomous-lifecycle-types';
import { ClosedLoopReconciler, type ReconcilerStatus } from '../telemetry/closed-loop-reconciler';
import { TelemetryEventBus } from '../telemetry/telemetry-event-bus';
import type { UnifiedTradeIntent } from './orchestrator-types';
import { logger } from '../../shared/utils/logger';

export interface StepExecutionResult {
  readonly enqueued: boolean;
  readonly verdict: RiskGateVerdict;
  readonly dispatch?: DispatchResult;
  readonly netProceedsUsd?: number;
}

export class UnifiedTradingLoop {
  public readonly queue: PrioritySignalQueue;
  public readonly conflictResolver: ConflictResolver;
  public readonly crossingEngine: InternalCrossingEngine;
  public readonly riskGate: SynchronizedRiskGate;
  public readonly dispatcher: TriModeDispatcher;
  public readonly lifecycle: AutonomousLifecycleManager;
  public readonly reconciler: ClosedLoopReconciler;
  public readonly eventBus: TelemetryEventBus;

  constructor(
    mode: TriMode = 'PAPER',
    initialNavUsd = 100000,
    liquidCashUsd = 30000
  ) {
    this.queue = new PrioritySignalQueue(50);
    this.conflictResolver = new ConflictResolver();
    this.crossingEngine = new InternalCrossingEngine();
    this.riskGate = new SynchronizedRiskGate({ totalNavUsd: initialNavUsd, liquidCashUsd });
    this.dispatcher = new TriModeDispatcher(mode);
    this.lifecycle = new AutonomousLifecycleManager();
    this.reconciler = new ClosedLoopReconciler(liquidCashUsd);
    this.eventBus = new TelemetryEventBus();

    this.lifecycle.transitionTo('RUNNING', 'System bootstrap');
  }

  public getState(): AutonomousLifecycleState {
    return this.lifecycle.getState();
  }

  public step(intent: UnifiedTradeIntent, unitPrice?: number): StepExecutionResult {
    const currentState = this.lifecycle.getState();
    if (currentState !== 'RUNNING') {
      logger.warn(`[UnifiedTradingLoop] Step rejected: loop is in ${currentState} state`);
      return {
        enqueued: false,
        verdict: {
          approved: false,
          reason: `Loop is in ${currentState} state`,
          scaledQuantity: 0,
          originalQuantity: intent.quantity,
          allocatedCapitalUsd: 0,
          currentNavUsd: this.riskGate.getNav(),
          cashBufferRatio: this.riskGate.getCash() / this.riskGate.getNav(),
          grossLeverage: 1.0,
          circuitBreakerTier: this.riskGate.getTier(),
        },
      };
    }

    const enqueued = this.queue.enqueue(intent);
    if (!enqueued) {
      this.eventBus.emit('desk.telemetry.alert', {
        eventType: 'REJECTED',
        reason: 'Queue capacity shed',
        intentId: intent.intentId,
      });
      return {
        enqueued: false,
        verdict: {
          approved: false,
          reason: 'Queue backpressure shedding rejected intent',
          scaledQuantity: 0,
          originalQuantity: intent.quantity,
          allocatedCapitalUsd: 0,
          currentNavUsd: this.riskGate.getNav(),
          cashBufferRatio: this.riskGate.getCash() / this.riskGate.getNav(),
          grossLeverage: 1.0,
          circuitBreakerTier: this.riskGate.getTier(),
        },
      };
    }

    const verdict = this.riskGate.validateOrder(intent, unitPrice);
    if (!verdict.approved) {
      this.eventBus.emit('desk.telemetry.alert', {
        eventType: 'REJECTED',
        reason: verdict.reason,
        intentId: intent.intentId,
      });
      return { enqueued: true, verdict };
    }

    const orderToDispatch: UnifiedTradeIntent =
      verdict.scaledQuantity !== intent.quantity
        ? { ...intent, quantity: verdict.scaledQuantity }
        : intent;

    const dispatch = this.dispatcher.dispatch(orderToDispatch, unitPrice);
    if (dispatch.status === 'FILLED' || dispatch.status === 'PARTIALLY_FILLED') {
      const fillNotional = dispatch.executedQuantity * dispatch.averagePrice;
      this.riskGate.commitFill(intent.engineId, intent.venue, fillNotional);
      this.reconciler.ingestFill(intent.engineId, 0, dispatch.feeUsd);
    }

    return {
      enqueued: true,
      verdict,
      dispatch,
      netProceedsUsd: dispatch.executedQuantity * dispatch.averagePrice - dispatch.feeUsd,
    };
  }

  public verifyZeroDrift(actualEquityUsd: number): ReconcilerStatus {
    return this.reconciler.reconcile(actualEquityUsd);
  }

  public triggerEmergencyHalt(reason = 'Critical anomaly'): void {
    this.lifecycle.triggerEmergencyHalt(reason);
    this.riskGate.setTier('HARD_STOP');
  }
}
