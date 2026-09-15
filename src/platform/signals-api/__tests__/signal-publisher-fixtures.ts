/**
 * Shared fixtures for signal-publisher tests.
 *
 * Exports three FusionResult variants used across publish/getFeed suites:
 *  - MOCK_FUSION: UP, 2 signals, 75% confidence
 *  - MOCK_FUSION_NEUTRAL: NEUTRAL, 1 signal, 3% confidence
 *  - MOCK_FUSION_EMPTY_SIGNALS: NEUTRAL, empty signals array
 */

import type { FusionResult } from '../../../desk/intelligence/signal-fusion-engine';

export const MOCK_FUSION: FusionResult = {
  direction: 'UP',
  confidence: 0.75,
  weightedScore: 0.42,
  signals: [
    { name: 'momentum', score: 0.6, weight: 1.0 },
    { name: 'volatility', score: 0.3, weight: 0.8 },
  ],
  reasoning: 'Weighted score 0.420 -> UP @ 75.0% confidence.',
};

export const MOCK_FUSION_NEUTRAL: FusionResult = {
  direction: 'NEUTRAL',
  confidence: 0.03,
  weightedScore: 0.02,
  signals: [
    { name: 'mean-reversion', score: 0.02, weight: 0.5 },
  ],
  reasoning: 'Weighted score 0.020 -> NEUTRAL @ 3.0% confidence.',
};

export const MOCK_FUSION_EMPTY_SIGNALS: FusionResult = {
  direction: 'NEUTRAL',
  confidence: 0,
  weightedScore: 0,
  signals: [],
  reasoning: 'No signals provided',
};
