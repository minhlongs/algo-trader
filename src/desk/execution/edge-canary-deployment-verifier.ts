/**
 * Edge Canary Deployment Verifier
 *
 * 4-tier canary staging verifier (Stage 0: 0% Shadow -> Stage 1: 1% Canary ->
 * Stage 2: 5-25% Step-Up -> Stage 3: 100% Production) with latency SLO (p99 < 15ms),
 * slippage check (<= 2.0 bps), KS-drift detection, and L0-L4 rollback hooks.
 */

import { RollbackLayer } from '../../rollback/rollback-types';
import {
  computeMean,
  computePercentile,
  kolmogorovSmirnov2Sample,
  type KsTestResult,
} from './edge-canary-stats';

export type CanaryStage = 0 | 1 | 2 | 3;

export interface CanaryStageConfig {
  stage: CanaryStage;
  name: string;
  trafficFraction: number; // 0.0, 0.01, 0.05-0.25, 1.0
  minSampleCount: number;
}

export interface CanaryVerificationCriteria {
  maxP99LatencyMs: number; // default: 15ms
  maxSlippageBps: number;   // default: 2.0 bps
  maxErrorRate: number;     // default: 0.005 (0.5%)
  ksAlpha: number;          // default: 0.05
  minSampleCount: number;   // default: 30
}

export interface CanaryTelemetrySample {
  latencyMs: number;
  slippageBps: number;
  isError: boolean;
  timestamp: number;
}

export interface CanaryVerificationVerdict {
  passed: boolean;
  currentStage: CanaryStage;
  nextRecommendedStage: CanaryStage;
  p99LatencyMs: number;
  meanSlippageBps: number;
  errorRate: number;
  ksLatencyDrift: KsTestResult;
  ksSlippageDrift: KsTestResult;
  violations: string[];
  recommendedRollbackLayer?: RollbackLayer;
}

export const CANARY_STAGES: Record<CanaryStage, CanaryStageConfig> = {
  0: { stage: 0, name: 'Stage 0: Shadow', trafficFraction: 0.0, minSampleCount: 30 },
  1: { stage: 1, name: 'Stage 1: Canary 1%', trafficFraction: 0.01, minSampleCount: 50 },
  2: { stage: 2, name: 'Stage 2: Step-Up 5-25%', trafficFraction: 0.25, minSampleCount: 100 },
  3: { stage: 3, name: 'Stage 3: Production 100%', trafficFraction: 1.0, minSampleCount: 200 },
};

export const DEFAULT_CANARY_CRITERIA: CanaryVerificationCriteria = {
  maxP99LatencyMs: 15.0,
  maxSlippageBps: 2.0,
  maxErrorRate: 0.005,
  ksAlpha: 0.05,
  minSampleCount: 30,
};

export class EdgeCanaryDeploymentVerifier {
  constructor(
    private criteria: CanaryVerificationCriteria = DEFAULT_CANARY_CRITERIA,
    private rollbackHook?: (layer: RollbackLayer, reason: string, meta?: Record<string, unknown>) => Promise<void> | void,
  ) {}

  async verifyStage(
    stage: CanaryStage,
    canarySamples: readonly CanaryTelemetrySample[],
    baselineSamples: readonly CanaryTelemetrySample[],
  ): Promise<CanaryVerificationVerdict> {
    const minSamples = Math.max(this.criteria.minSampleCount, CANARY_STAGES[stage].minSampleCount);
    const violations: string[] = [];
    let rollbackLayer: RollbackLayer | undefined;

    if (canarySamples.length < minSamples) {
      violations.push(`Insufficient sample count: ${canarySamples.length} < required ${minSamples}`);
    }

    const latencies = canarySamples.map((s) => s.latencyMs);
    const slippages = canarySamples.map((s) => s.slippageBps);
    const errorCount = canarySamples.filter((s) => s.isError).length;
    const errorRate = canarySamples.length > 0 ? errorCount / canarySamples.length : 0;
    const p99Latency = computePercentile(latencies, 99);
    const meanSlippage = computeMean(slippages);

    const baseLatencies = baselineSamples.map((s) => s.latencyMs);
    const baseSlippages = baselineSamples.map((s) => s.slippageBps);
    const ksLatency = kolmogorovSmirnov2Sample(baseLatencies, latencies, this.criteria.ksAlpha);
    const ksSlippage = kolmogorovSmirnov2Sample(baseSlippages, slippages, this.criteria.ksAlpha);

    if (errorRate > this.criteria.maxErrorRate) {
      violations.push(`Error rate ${(errorRate * 100).toFixed(2)}% exceeds max ${(this.criteria.maxErrorRate * 100).toFixed(2)}%`);
      rollbackLayer = errorRate > 0.05 ? RollbackLayer.L1_KILL : RollbackLayer.L0_SIGNALS;
    }

    if (p99Latency > this.criteria.maxP99LatencyMs) {
      violations.push(`p99 Latency ${p99Latency.toFixed(2)}ms exceeds SLO limit ${this.criteria.maxP99LatencyMs}ms`);
      rollbackLayer = rollbackLayer ?? RollbackLayer.L2_DISABLED;
    }

    if (meanSlippage > this.criteria.maxSlippageBps) {
      violations.push(`Mean slippage ${meanSlippage.toFixed(2)} bps exceeds limit ${this.criteria.maxSlippageBps} bps`);
      rollbackLayer = rollbackLayer ?? RollbackLayer.L3_DRAWDOWN;
    }

    if (ksLatency.driftDetected || ksSlippage.driftDetected) {
      const details = [ksLatency.driftDetected && 'latency', ksSlippage.driftDetected && 'slippage'].filter(Boolean).join(' & ');
      violations.push(`KS distribution drift detected in ${details} (D > critical)`);
      rollbackLayer = rollbackLayer ?? RollbackLayer.L4_PAPER_GATE;
    }

    const passed = violations.length === 0;
    const nextRecommendedStage = passed
      ? ((Math.min(3, stage + 1)) as CanaryStage)
      : (Math.max(0, stage - 1) as CanaryStage);

    if (!passed && rollbackLayer && this.rollbackHook) {
      await this.rollbackHook(rollbackLayer, violations.join('; '), {
        stage,
        p99Latency,
        meanSlippage,
        errorRate,
      });
    }

    return {
      passed,
      currentStage: stage,
      nextRecommendedStage,
      p99LatencyMs: p99Latency,
      meanSlippageBps: meanSlippage,
      errorRate,
      ksLatencyDrift: ksLatency,
      ksSlippageDrift: ksSlippage,
      violations,
      recommendedRollbackLayer: rollbackLayer,
    };
  }
}
