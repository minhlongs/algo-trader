/**
 * Live Trading Pipeline State & Metrics Manager
 * Encapsulates telemetry samples, error tracking, execution counters, and stage status.
 */

import type { CanaryStage, CanaryTelemetrySample, CanaryVerificationVerdict } from '../execution/edge-canary-deployment-verifier';
import type { PipelineMetrics, PipelineStatus } from './live-trading-pipeline-types';

export class LiveTradingPipelineState {
  public status: PipelineStatus = 'uninitialized';
  public startedAt?: number;
  public opportunitiesDetected = 0;
  public ordersRelayed = 0;
  public successfulOrders = 0;
  public failedOrders = 0;
  public evolutionCycles = 0;
  public activeCanaryStage: CanaryStage;
  public lastVerdict?: CanaryVerificationVerdict;
  public canarySamples: CanaryTelemetrySample[] = [];
  public baselineSamples: CanaryTelemetrySample[] = [];
  public errorsCount = 0;
  public lastError?: string;

  constructor(initialStage: CanaryStage = 0) {
    this.activeCanaryStage = initialStage;
    this.status = 'idle';
  }

  public recordTelemetry(sample: CanaryTelemetrySample, isBaseline = false): void {
    if (isBaseline) {
      this.baselineSamples.push(sample);
    } else {
      this.canarySamples.push(sample);
    }
  }

  public recordError(err: Error, context: string): void {
    this.errorsCount++;
    this.lastError = `[${context}] ${err.message}`;
  }

  public getMetrics(): PipelineMetrics {
    const uptimeMs = this.startedAt && this.status === 'running' ? Date.now() - this.startedAt : 0;
    return {
      status: this.status,
      startedAt: this.startedAt,
      uptimeMs,
      opportunitiesDetected: this.opportunitiesDetected,
      ordersRelayed: this.ordersRelayed,
      successfulOrders: this.successfulOrders,
      failedOrders: this.failedOrders,
      evolutionCycles: this.evolutionCycles,
      activeCanaryStage: this.activeCanaryStage,
      lastVerdict: this.lastVerdict,
      totalTelemetrySamples: this.canarySamples.length + this.baselineSamples.length,
      errorsCount: this.errorsCount,
      lastError: this.lastError,
    };
  }
}
