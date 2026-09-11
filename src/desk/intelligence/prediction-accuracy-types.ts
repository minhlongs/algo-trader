/**
 * Prediction Accuracy Types and Persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../shared/utils/logger';
import { readJson } from '../../shared/persistence/persistent-store';

export interface Prediction {
  id: string;
  marketId: string;
  title: string;
  predictedOutcome: 'YES' | 'NO';
  confidence: number;
  predictedAt: number;
  marketYesPrice: number;
  strategy: string;
  // Resolution fields — null until market resolves
  actualOutcome: 'YES' | 'NO' | null;
  resolvedAt: number | null;
  correct: boolean | null;
}

export interface AccuracyReport {
  totalPredictions: number;
  resolved: number;
  pending: number;
  correct: number;
  incorrect: number;
  winRate: number;
  byStrategy: Record<string, { total: number; correct: number; winRate: number }>;
  byConfidenceBucket: Record<string, { total: number; correct: number; winRate: number }>;
  avgConfidenceWhenCorrect: number;
  avgConfidenceWhenIncorrect: number;
}

export interface StrategyAccuracy {
  strategyName: string;
  winRate: number;
  totalTrades: number;
  lastUpdated: string;
}

// Gamma API response shape (partial — only what we need)
export interface GammaMarket {
  id: string;
  question?: string;
  // Gamma returns resolvedOutcome as "YES" | "NO" | null when closed
  resolvedOutcome?: string | null;
}

export const PREDICTIONS_FILE = path.resolve(process.cwd(), 'data/predictions.json');
export const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets?closed=true&limit=100';

/** Load predictions array from disk; returns empty array if file missing or malformed */
export function loadPredictions(): Prediction[] {
  try {
    return readJson<Prediction[]>(PREDICTIONS_FILE) ?? [];
  } catch (err) {
    logger.warn('[AccuracyTracker] Failed to load predictions file — starting fresh', { err });
    return [];
  }
}

/** Persist full predictions array atomically via write-then-rename */
export function savePredictions(predictions: Prediction[]): void {
  const dir = path.dirname(PREDICTIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${PREDICTIONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(predictions, null, 2), 'utf-8');
  fs.renameSync(tmp, PREDICTIONS_FILE);
}
