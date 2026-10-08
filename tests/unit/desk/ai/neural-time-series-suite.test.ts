import { describe, it, expect } from 'vitest';
import { StateSpacePredictor } from '../../../../src/desk/ai/state-space-predictor';
import { RegimeTransformerFilter } from '../../../../src/desk/ai/regime-transformer-filter';
import { RealTimeFeatureStore } from '../../../../src/desk/ai/real-time-feature-store';

describe('Neural Time-Series & Feature Pipeline Suite', () => {
  describe('StateSpacePredictor', () => {
    it('propagates state-space transitions and projects forward expected returns', () => {
      const predictor = new StateSpacePredictor({
        stateDimension: 4,
        transitionDecay: 0.8,
        observationWeight: 0.4,
      });

      const p1 = predictor.updateAndPredict(0.015, 1);
      expect(p1.predictedReturn).toBeGreaterThan(0);
      expect(p1.confidenceLower).toBeLessThan(p1.predictedReturn);
      expect(p1.confidenceUpper).toBeGreaterThan(p1.predictedReturn);
      expect(p1.stateVector.length).toBe(4);

      const pMulti = predictor.updateAndPredict(0.02, 3);
      expect(pMulti.stepAhead).toBe(3);
      expect(pMulti.confidenceUpper - pMulti.confidenceLower).toBeGreaterThan(
        p1.confidenceUpper - p1.confidenceLower
      );
    });
  });

  describe('RegimeTransformerFilter', () => {
    it('computes causal self-attention weights and identifies trending bull regime', () => {
      const filter = new RegimeTransformerFilter(8);

      // Ingest prices until buffer fills
      filter.ingestPrice(100);
      filter.ingestPrice(100.5);
      filter.ingestPrice(101.2);
      filter.ingestPrice(101.8);
      filter.ingestPrice(102.5);
      filter.ingestPrice(103.0);
      filter.ingestPrice(103.8);
      const res = filter.ingestPrice(104.5);

      expect(res).toBeDefined();
      expect(res?.attentionWeights.length).toBe(8);
      expect(res?.predictedRegime).toBe('TRENDING_BULL');
      expect(res?.regimeProbability).toBeGreaterThan(0.5);
    });
  });

  describe('RealTimeFeatureStore', () => {
    it('normalizes streaming market metrics into standardized feature vectors', () => {
      const store = new RealTimeFeatureStore(50);

      const feat = store.recordObservation(1000, 'BTC/USD', 0.005, 4.2, 0.35, 150000);
      expect(feat.symbol).toBe('BTC/USD');
      expect(feat.normalizedSpread).toBeCloseTo(0.84, 2);
      expect(feat.volumeIntensity).toBeGreaterThan(1.0);
      expect(feat.orderBookImbalance).toBe(0.35);

      const latest = store.getLatestFeature('BTC/USD');
      expect(latest?.timestampMs).toBe(1000);
    });
  });
});
