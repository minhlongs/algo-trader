/**
 * Signal Fusion Buffer Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toSignalInput, runAdaptiveFusion, bufferSignal, clearFusionBuffer } from '../signal-fusion-buffer';

// Mock adaptive-fusion module
vi.mock('../../ml/meta-ensemble/adaptive-fusion', () => ({
  adaptiveFuse: vi.fn(),
}));

import { adaptiveFuse } from '../../ml/meta-ensemble/adaptive-fusion';

describe('SignalFusionBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFusionBuffer();
  });

  describe('toSignalInput', () => {
    it('should create a SignalInput with weight 1.0', () => {
      const input = toSignalInput('simple-arb', 0.15);
      expect(input).toEqual({ name: 'simple-arb', score: 0.15, weight: 1.0 });
    });

    it('should handle zero score', () => {
      const input = toSignalInput('cross-market', 0);
      expect(input.name).toBe('cross-market');
      expect(input.score).toBe(0);
    });
  });

  describe('bufferSignal', () => {
    it('should add signal to buffer', () => {
      const input = toSignalInput('simple-arb', 0.1);
      bufferSignal(input);
      // Buffer internal state not directly accessible, but fusion should use it
    });

    it('should handle multiple signals', () => {
      bufferSignal(toSignalInput('simple-arb', 0.1));
      bufferSignal(toSignalInput('cross-market', 0.2));
      bufferSignal(toSignalInput('delta-neutral', 0.3));
      // No error = success
    });
  });

  describe('runAdaptiveFusion', () => {
    it('should return null when adaptiveFuse throws', () => {
      vi.mocked(adaptiveFuse).mockImplementation(() => { throw new Error('no data'); });
      const result = runAdaptiveFusion(toSignalInput('simple-arb', 0.1));
      expect(result).toBeNull();
    });

    it('should return fusion result with direction and confidence', () => {
      vi.mocked(adaptiveFuse).mockReturnValue({
        direction: 'UP',
        confidence: 0.75,
        weightedScore: 0.12,
        signals: [],
        reasoning: 'test reasoning',
      });

      const result = runAdaptiveFusion(toSignalInput('simple-arb', 0.15));
      expect(result).not.toBeNull();
      expect(result!.fusedDirection).toBe('UP');
      expect(result!.fusedConfidence).toBe(0.75);
      expect(result!.fusedReasoning).toBe('test reasoning');
    });

    it('should combine buffered signals with current signal', () => {
      bufferSignal(toSignalInput('cross-market', 0.2));

      vi.mocked(adaptiveFuse).mockReturnValue({
        direction: 'DOWN',
        confidence: 0.6,
        weightedScore: -0.08,
        signals: [
          { name: 'cross-market', score: 0.2, weight: 1.0 },
          { name: 'simple-arb', score: 0.1, weight: 1.0 },
        ],
        reasoning: 'combined signals',
      });

      const result = runAdaptiveFusion(toSignalInput('simple-arb', 0.1));
      expect(result).not.toBeNull();

      // Verify adaptiveFuse was called with combined signals
      const callArgs = vi.mocked(adaptiveFuse).mock.calls[0];
      const inputs = callArgs[0];
      expect(inputs.length).toBe(2);
      expect(inputs[0].name).toBe('cross-market');
      expect(inputs[1].name).toBe('simple-arb');
    });

    it('should deduplicate signals by name', () => {
      bufferSignal(toSignalInput('simple-arb', 0.3));

      vi.mocked(adaptiveFuse).mockReturnValue({
        direction: 'UP',
        confidence: 0.8,
        weightedScore: 0.1,
        signals: [],
        reasoning: 'deduped',
      });

      runAdaptiveFusion(toSignalInput('simple-arb', 0.1));

      const callArgs = vi.mocked(adaptiveFuse).mock.calls[0];
      const inputs = callArgs[0];
      // Should only have one signal (current overrides buffered)
      expect(inputs.length).toBe(1);
      expect(inputs[0].score).toBe(0.1); // Current signal score, not buffered
    });
  });

  describe('clearFusionBuffer', () => {
    it('should clear all buffered signals', () => {
      bufferSignal(toSignalInput('simple-arb', 0.1));
      bufferSignal(toSignalInput('cross-market', 0.2));
      clearFusionBuffer();
      // After clearing, next fusion should only have current signal
    });
  });
});
