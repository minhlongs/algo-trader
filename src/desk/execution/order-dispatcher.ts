// SPDX-License-Identifier: MIT
/**
 * Step 08: Cloud Signal Bridge & Order Dispatcher Facade
 * Wraps TriModeDispatcher to dispatch trade execution intents locally (PAPER/SHADOW/LIVE)
 * and emit structured telemetry signals for cloud RaaS bridge subscribers.
 *
 * @module desk/execution/order-dispatcher
 */

import { logger } from '../../shared/utils/logger';
import type { LiveExecutionGuard } from './live-execution-guard';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import { TriModeDispatcher } from './tri-mode-dispatcher';
import type { DispatchResult, OrderSlice, TriMode } from './tri-mode-types';

export type { DispatchResult, OrderSlice, TriMode };
export { TriModeDispatcher };

export interface CloudSignalEnvelope {
  readonly signalId: string;
  readonly intent: UnifiedTradeIntent;
  readonly result: DispatchResult;
  readonly emittedAt: number;
  readonly bridgeEndpoint?: string;
}

export interface OrderDispatcherConfig {
  readonly initialMode?: TriMode;
  readonly liveGuard?: LiveExecutionGuard;
  readonly cloudBridgeEndpoint?: string;
}

export class OrderDispatcher {
  private readonly dispatcher: TriModeDispatcher;
  private readonly cloudBridgeEndpoint?: string;
  private readonly signalHistory: CloudSignalEnvelope[] = [];

  constructor(config?: OrderDispatcherConfig) {
    this.dispatcher = new TriModeDispatcher(config?.initialMode ?? 'PAPER', config?.liveGuard);
    this.cloudBridgeEndpoint = config?.cloudBridgeEndpoint;
  }

  public setMode(mode: TriMode): void {
    this.dispatcher.setMode(mode);
  }

  public getMode(): TriMode {
    return this.dispatcher.getMode();
  }

  public getLiveApiCallsCount(): number {
    return this.dispatcher.getLiveApiCallsCount();
  }

  public getVirtualFillsCount(): number {
    return this.dispatcher.getVirtualFillsCount();
  }

  public getSignalHistory(): readonly CloudSignalEnvelope[] {
    return this.signalHistory;
  }

  public dispatchOrder(
    intent: UnifiedTradeIntent,
    priceOverride?: number,
    partialFillRatio = 1.0
  ): DispatchResult {
    const result = this.dispatcher.dispatch(intent, priceOverride, partialFillRatio);
    const envelope: CloudSignalEnvelope = {
      signalId: `sig-${result.orderId}`,
      intent,
      result,
      emittedAt: Date.now(),
      bridgeEndpoint: this.cloudBridgeEndpoint,
    };
    this.signalHistory.push(envelope);
    logger.debug('[OrderDispatcher] Dispatched order signal', {
      signalId: envelope.signalId,
      mode: result.mode,
      status: result.status,
    });
    return result;
  }

  public sliceTwap(totalQuantity: number, numSlices: number, totalDurationMs: number): OrderSlice[] {
    return this.dispatcher.sliceTwap(totalQuantity, numSlices, totalDurationMs);
  }
}
