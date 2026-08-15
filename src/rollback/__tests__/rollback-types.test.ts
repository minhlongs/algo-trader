/**
 * Unit tests for rollback-types — enums, severity map, and overallStateFromLayer
 */
import { describe, it, expect } from 'vitest';
import {
  RollbackLayer,
  RollbackState,
  LAYER_SEVERITY,
  DEFAULT_ROLLBACK_CONFIG,
  overallStateFromLayer,
} from '../rollback-types';

describe('RollbackLayer enum', () => {
  it('has exactly 5 members in increasing severity order', () => {
    const members = Object.values(RollbackLayer);
    expect(members).toEqual([
      'L0_SIGNALS',
      'L1_KILL',
      'L2_DISABLED',
      'L3_DRAWDOWN',
      'L4_PAPER_GATE',
    ]);
  });

  it('each member matches its key name', () => {
    for (const [key, value] of Object.entries(RollbackLayer)) {
      expect(key).toBe(value);
    }
  });
});

describe('RollbackState enum', () => {
  it('has exactly 4 members', () => {
    const members = Object.values(RollbackState);
    expect(members).toHaveLength(4);
    expect(members).toEqual(['ACTIVE', 'RESTRICTED', 'HALTED', 'BLOCKED']);
  });
});

describe('LAYER_SEVERITY', () => {
  it('maps all 5 layers to distinct severity numbers 1–5', () => {
    const layers = Object.values(RollbackLayer);
    expect(Object.keys(LAYER_SEVERITY)).toHaveLength(5);
    for (const layer of layers) {
      expect(LAYER_SEVERITY[layer]).toBeGreaterThanOrEqual(1);
      expect(LAYER_SEVERITY[layer]).toBeLessThanOrEqual(5);
    }
  });

  it('assigns higher severity to higher-index layers (L4=1 lowest, L0=5 highest)', () => {
    expect(LAYER_SEVERITY[RollbackLayer.L4_PAPER_GATE]).toBe(1);
    expect(LAYER_SEVERITY[RollbackLayer.L3_DRAWDOWN]).toBe(2);
    expect(LAYER_SEVERITY[RollbackLayer.L2_DISABLED]).toBe(3);
    expect(LAYER_SEVERITY[RollbackLayer.L1_KILL]).toBe(4);
    expect(LAYER_SEVERITY[RollbackLayer.L0_SIGNALS]).toBe(5);
  });
});

describe('DEFAULT_ROLLBACK_CONFIG', () => {
  it('has valid default values', () => {
    expect(DEFAULT_ROLLBACK_CONFIG.enableCrossInstanceSync).toBe(true);
    expect(DEFAULT_ROLLBACK_CONFIG.signalStalenessMs).toBe(5 * 60_000);
    expect(DEFAULT_ROLLBACK_CONFIG.signalErrorRateThreshold).toBe(0.5);
    expect(DEFAULT_ROLLBACK_CONFIG.paperGateMinDays).toBe(30);
  });
});

describe('overallStateFromLayer', () => {
  it('returns ACTIVE when activeLayer is null', () => {
    expect(overallStateFromLayer(null)).toBe(RollbackState.ACTIVE);
  });

  it('returns RESTRICTED for L4_PAPER_GATE (severity 1)', () => {
    expect(overallStateFromLayer(RollbackLayer.L4_PAPER_GATE)).toBe(RollbackState.RESTRICTED);
  });

  it('returns RESTRICTED for L3_DRAWDOWN (severity 2)', () => {
    expect(overallStateFromLayer(RollbackLayer.L3_DRAWDOWN)).toBe(RollbackState.RESTRICTED);
  });

  it('returns HALTED for L2_DISABLED (severity 3)', () => {
    expect(overallStateFromLayer(RollbackLayer.L2_DISABLED)).toBe(RollbackState.HALTED);
  });

  it('returns BLOCKED for L1_KILL (severity 4)', () => {
    expect(overallStateFromLayer(RollbackLayer.L1_KILL)).toBe(RollbackState.BLOCKED);
  });

  it('returns BLOCKED for L0_SIGNALS (severity 5)', () => {
    expect(overallStateFromLayer(RollbackLayer.L0_SIGNALS)).toBe(RollbackState.BLOCKED);
  });
});
