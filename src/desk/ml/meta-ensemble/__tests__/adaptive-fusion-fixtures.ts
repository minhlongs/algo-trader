/**
 * Fixtures and factory helpers for AdaptiveFusion test suites.
 */
import type { SignalInput } from '../../../intelligence/signal-fusion-engine';

export interface TestPrediction {
  id: string;
  marketId: string;
  title: string;
  predictedOutcome: 'YES' | 'NO';
  confidence: number;
  predictedAt: number;
  marketYesPrice: number;
  strategy: string;
  actualOutcome: 'YES' | 'NO' | null;
  resolvedAt: number | null;
  correct: boolean | null;
}

export function makeSignal(overrides: Partial<SignalInput> = {}): SignalInput {
  return { name: 'default', score: 0.5, weight: 1.0, ...overrides };
}

export function makePrediction(overrides: Partial<TestPrediction> = {}): TestPrediction {
  return {
    id: `pred-${Math.random().toString(36).slice(2, 8)}`,
    marketId: 'm1',
    title: 'test',
    predictedOutcome: 'YES',
    confidence: 0.7,
    predictedAt: Date.now() - 3600_000,
    marketYesPrice: 0.65,
    strategy: 'kronos',
    actualOutcome: null,
    resolvedAt: null,
    correct: null,
    ...overrides,
  };
}

export function buildPredictionsFile(predictions: TestPrediction[]): string {
  return JSON.stringify(predictions);
}
