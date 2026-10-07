import { describe, it, expect, vi } from 'vitest';
import {
  EdgeCanaryDeploymentVerifier,
  type CanaryTelemetrySample,
  DEFAULT_CANARY_CRITERIA,
} from '../../../../src/desk/execution/edge-canary-deployment-verifier';
import {
  kolmogorovSmirnov2Sample,
  computePercentile,
  computeMean,
} from '../../../../src/desk/execution/edge-canary-stats';
import { RollbackLayer } from '../../../../src/rollback/rollback-types';

describe('Edge Canary Statistics & Kolmogorov-Smirnov Drift Test', () => {
  it('computes percentiles and mean accurately', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(computeMean(data)).toBe(5.5);
    expect(computePercentile(data, 50)).toBe(5);
    expect(computePercentile(data, 90)).toBe(9);
    expect(computePercentile(data, 99)).toBe(10);
  });

  it('detects no drift between identical or very similar distributions', () => {
    const d1 = Array.from({ length: 100 }, (_, i) => 10 + Math.sin(i));
    const d2 = Array.from({ length: 100 }, (_, i) => 10 + Math.cos(i));

    const result = kolmogorovSmirnov2Sample(d1, d2, 0.05);
    expect(result.driftDetected).toBe(false);
    expect(result.statistic).toBeLessThan(result.criticalValue);
  });

  it('detects statistically significant drift when distributions diverge', () => {
    const baseline = Array.from({ length: 100 }, (_, i) => 10 + (i % 5));
    const drifted = Array.from({ length: 100 }, (_, i) => 50 + (i % 5)); // Heavy regime shift

    const result = kolmogorovSmirnov2Sample(baseline, drifted, 0.05);
    expect(result.driftDetected).toBe(true);
    expect(result.statistic).toBeGreaterThan(result.criticalValue);
  });
});

describe('Edge Canary Deployment Verifier: Staging & SLOs', () => {
  const generateSamples = (
    count: number,
    baseLatency = 8.0,
    baseSlippage = 1.0,
    errorCount = 0,
    offset = 0,
  ): CanaryTelemetrySample[] => {
    return Array.from({ length: count }, (_, i) => ({
      latencyMs: baseLatency + (((i + offset) * 7) % 20) * 0.1,
      slippageBps: baseSlippage + (((i + offset) * 3) % 15) * 0.05,
      isError: i < errorCount,
      timestamp: 1700000000 + i * 1000,
    }));
  };

  it('approves healthy Stage 0 (Shadow) and recommends progression to Stage 1', async () => {
    const verifier = new EdgeCanaryDeploymentVerifier();
    const baseline = generateSamples(50, 8.0, 1.0, 0, 0);
    const canary = generateSamples(50, 8.0, 1.0, 0, 1);

    const verdict = await verifier.verifyStage(0, canary, baseline);

    expect(verdict.passed).toBe(true);
    expect(verdict.currentStage).toBe(0);
    expect(verdict.nextRecommendedStage).toBe(1);
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.p99LatencyMs).toBeLessThan(15.0);
    expect(verdict.meanSlippageBps).toBeLessThan(2.0);
  });

  it('approves healthy Stage 2 (Step-Up 25%) and recommends progression to Stage 3 (Production)', async () => {
    const verifier = new EdgeCanaryDeploymentVerifier();
    const baseline = generateSamples(120, 7.5, 0.8, 0, 0);
    const canary = generateSamples(120, 7.5, 0.8, 0, 2);

    const verdict = await verifier.verifyStage(2, canary, baseline);

    expect(verdict.passed).toBe(true);
    expect(verdict.currentStage).toBe(2);
    expect(verdict.nextRecommendedStage).toBe(3);
  });

  it('detects latency SLO breach (> 15ms) and triggers L2_DISABLED rollback', async () => {
    const rollbackMock = vi.fn();
    const verifier = new EdgeCanaryDeploymentVerifier(DEFAULT_CANARY_CRITERIA, rollbackMock);

    const baseline = generateSamples(50, 8.0, 1.0);
    // Canary with severe latency tail breach
    const canary = generateSamples(50, 22.0, 1.0);

    const verdict = await verifier.verifyStage(1, canary, baseline);

    expect(verdict.passed).toBe(false);
    expect(verdict.nextRecommendedStage).toBe(0); // Step down
    expect(verdict.violations.some((v) => v.includes('Latency'))).toBe(true);
    expect(verdict.recommendedRollbackLayer).toBe(RollbackLayer.L2_DISABLED);

    expect(rollbackMock).toHaveBeenCalledWith(
      RollbackLayer.L2_DISABLED,
      expect.stringContaining('Latency'),
      expect.objectContaining({ stage: 1 }),
    );
  });

  it('detects slippage breach (> 2.0 bps) and triggers L3_DRAWDOWN rollback', async () => {
    const rollbackMock = vi.fn();
    const verifier = new EdgeCanaryDeploymentVerifier(DEFAULT_CANARY_CRITERIA, rollbackMock);

    const baseline = generateSamples(50, 8.0, 1.0);
    const canary = generateSamples(50, 8.0, 3.5); // 3.5 bps slippage

    const verdict = await verifier.verifyStage(1, canary, baseline);

    expect(verdict.passed).toBe(false);
    expect(verdict.violations.some((v) => v.includes('Mean slippage'))).toBe(true);
    expect(verdict.recommendedRollbackLayer).toBe(RollbackLayer.L3_DRAWDOWN);
    expect(rollbackMock).toHaveBeenCalledWith(
      RollbackLayer.L3_DRAWDOWN,
      expect.stringContaining('slippage'),
      expect.anything(),
    );
  });

  it('detects critical error spike (> 5%) and triggers L1_KILL emergency rollback', async () => {
    const rollbackMock = vi.fn();
    const verifier = new EdgeCanaryDeploymentVerifier(DEFAULT_CANARY_CRITERIA, rollbackMock);

    const baseline = generateSamples(60, 8.0, 1.0, 0);
    const canary = generateSamples(60, 8.0, 1.0, 10); // 10/60 ~ 16.6% error rate

    const verdict = await verifier.verifyStage(1, canary, baseline);

    expect(verdict.passed).toBe(false);
    expect(verdict.recommendedRollbackLayer).toBe(RollbackLayer.L1_KILL);
    expect(rollbackMock).toHaveBeenCalledWith(
      RollbackLayer.L1_KILL,
      expect.stringContaining('Error rate'),
      expect.anything(),
    );
  });

  it('detects KS distribution drift and triggers L4_PAPER_GATE rollback', async () => {
    const rollbackMock = vi.fn();
    const verifier = new EdgeCanaryDeploymentVerifier(DEFAULT_CANARY_CRITERIA, rollbackMock);

    // Latency is under 15ms and slippage under 2.0, but distribution is bimodally shifted
    const baseline = Array.from({ length: 60 }, (_, i) => ({
      latencyMs: 5.0 + (i % 2) * 0.2,
      slippageBps: 0.5 + (i % 2) * 0.1,
      isError: false,
      timestamp: 1700000000 + i * 1000,
    }));
    const canary = Array.from({ length: 60 }, (_, i) => ({
      latencyMs: 12.0 + (i % 2) * 0.2, // shifted distribution
      slippageBps: 0.5 + (i % 2) * 0.1,
      isError: false,
      timestamp: 1700000000 + i * 1000,
    }));

    const verdict = await verifier.verifyStage(1, canary, baseline);

    expect(verdict.passed).toBe(false);
    expect(verdict.ksLatencyDrift.driftDetected).toBe(true);
    expect(verdict.violations.some((v) => v.includes('KS distribution drift'))).toBe(true);
    expect(verdict.recommendedRollbackLayer).toBe(RollbackLayer.L4_PAPER_GATE);
    expect(rollbackMock).toHaveBeenCalledWith(
      RollbackLayer.L4_PAPER_GATE,
      expect.stringContaining('KS distribution drift'),
      expect.anything(),
    );
  });
});
