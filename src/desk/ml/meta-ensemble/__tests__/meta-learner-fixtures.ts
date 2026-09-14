/**
 * Fixtures and generator helpers for meta-learner unit tests.
 * Zero explicit any types to respect quality ratchet.
 */

export interface PredictionFixture {
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

export function makePrediction(
  overrides: Record<string, unknown> = {},
): PredictionFixture {
  return {
    id: `pred-${Math.random().toString(36).slice(2, 8)}`,
    marketId: 'market-1',
    title: 'Will BTC be above $100k?',
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

export function buildPredictionsFile(
  predictions: PredictionFixture[],
): string {
  return JSON.stringify(predictions);
}

export function generateStrategyPredictions(
  strategy: string,
  correctCount: number,
  incorrectCount: number,
): PredictionFixture[] {
  const preds: PredictionFixture[] = [];
  for (let i = 0; i < correctCount; i++) {
    preds.push(
      makePrediction({ strategy, correct: true, actualOutcome: 'YES' }),
    );
  }
  for (let i = 0; i < incorrectCount; i++) {
    preds.push(
      makePrediction({ strategy, correct: false, actualOutcome: 'NO' }),
    );
  }
  return preds;
}
