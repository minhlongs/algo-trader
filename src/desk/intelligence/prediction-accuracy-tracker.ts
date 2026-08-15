/**
 * Prediction Accuracy Tracker
 * Records bot predictions vs actual Polymarket resolutions — no money required.
 * Persists to data/predictions.json. Resolution checker polls Gamma API every 5 min.
 *
 * Flow:
 *   recordPrediction() → data/predictions.json (append)
 *   checkResolutions() → Gamma API closed markets → update actualOutcome / correct
 *   getAccuracyReport() → AccuracyReport (win rate, by strategy, by confidence bucket)
 *   startResolutionChecker() → background interval polling
 *   printAccuracyReport() → formatted console output
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../shared/utils/logger';
import { upsertPredictionPg, updatePredictionResolutionPg } from './prediction-pg-store';

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

// Gamma API response shape (partial — only what we need)
interface GammaMarket {
  id: string;
  question?: string;
  // Gamma returns resolvedOutcome as "YES" | "NO" | null when closed
  resolvedOutcome?: string | null;
}

const PREDICTIONS_FILE = path.resolve(process.cwd(), 'data/predictions.json');
const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets?closed=true&limit=100';

// Load predictions array from disk; returns empty array if file missing or malformed
function loadPredictions(): Prediction[] {
  try {
    if (!fs.existsSync(PREDICTIONS_FILE)) return [];
    const raw = fs.readFileSync(PREDICTIONS_FILE, 'utf-8');
    return JSON.parse(raw) as Prediction[];
  } catch (err) {
    logger.warn('[AccuracyTracker] Failed to load predictions file — starting fresh', { err });
    return [];
  }
}

// Persist full predictions array atomically via write-then-rename
function savePredictions(predictions: Prediction[]): void {
  const dir = path.dirname(PREDICTIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${PREDICTIONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(predictions, null, 2), 'utf-8');
  fs.renameSync(tmp, PREDICTIONS_FILE);
}

/** Append a new prediction to data/predictions.json + PostgreSQL dual-write */
export function recordPrediction(prediction: Prediction): void {
  const predictions = loadPredictions();
  const idx = predictions.findIndex(p => p.id === prediction.id);
  if (idx >= 0) {
    predictions[idx] = prediction;
  } else {
    predictions.push(prediction);
  }
  savePredictions(predictions);

  // Dual-write to PostgreSQL (fire-and-forget — failures logged, never block)
  upsertPredictionPg(prediction).catch((err) => {
    logger.debug('[AccuracyTracker] PG dual-write failed', { id: prediction.id, err });
  });

  logger.info('[AccuracyTracker] Prediction recorded', {
    id: prediction.id,
    market: prediction.title,
    predicted: prediction.predictedOutcome,
    confidence: prediction.confidence,
    strategy: prediction.strategy,
  });
}

/** Fetch resolved markets from Gamma API and update pending predictions */
export async function checkResolutions(): Promise<number> {
  const predictions = loadPredictions();
  const pending = predictions.filter(p => p.actualOutcome === null);
  if (pending.length === 0) {
    logger.debug('[AccuracyTracker] No pending predictions to check');
    return 0;
  }

  let resolvedCount = 0;
  try {
    const resp = await fetch(GAMMA_API_URL, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      logger.warn('[AccuracyTracker] Gamma API error', { status: resp.status });
      return 0;
    }

    const markets = await resp.json() as GammaMarket[];
    // Build lookup by market id for O(1) access
    const resolvedMap = new Map<string, string>();
    for (const m of markets) {
      if (m.resolvedOutcome === 'YES' || m.resolvedOutcome === 'NO') {
        resolvedMap.set(m.id, m.resolvedOutcome);
      }
    }

    let changed = false;
    for (const pred of predictions) {
      if (pred.actualOutcome !== null) continue;
      const outcome = resolvedMap.get(pred.marketId);
      if (outcome === 'YES' || outcome === 'NO') {
        pred.actualOutcome = outcome;
        pred.resolvedAt = Date.now();
        pred.correct = pred.predictedOutcome === outcome;
        resolvedCount++;
        changed = true;

        // Dual-write resolution to PostgreSQL
        updatePredictionResolutionPg(pred.id, outcome, pred.correct).catch(() => {});

        logger.info('[AccuracyTracker] Prediction resolved', {
          id: pred.id,
          predicted: pred.predictedOutcome,
          actual: outcome,
          correct: pred.correct,
        });
      }
    }

    if (changed) savePredictions(predictions);
  } catch (err) {
    logger.error('[AccuracyTracker] Resolution check failed', { err });
  }

  return resolvedCount;
}

/** Bucket confidence to nearest 10% range e.g. "0.7-0.8" */
function confidenceBucket(c: number): string {
  const lo = Math.floor(c * 10) / 10;
  const hi = Math.min(lo + 0.1, 1.0);
  return `${lo.toFixed(1)}-${hi.toFixed(1)}`;
}

/** Compute full accuracy stats across all recorded predictions */
export function getAccuracyReport(): AccuracyReport {
  const predictions = loadPredictions();
  const resolved = predictions.filter(p => p.actualOutcome !== null);
  const correct = resolved.filter(p => p.correct === true);
  const incorrect = resolved.filter(p => p.correct === false);

  const byStrategy: AccuracyReport['byStrategy'] = {};
  const byConfidenceBucket: AccuracyReport['byConfidenceBucket'] = {};

  for (const p of resolved) {
    // By strategy
    if (!byStrategy[p.strategy]) byStrategy[p.strategy] = { total: 0, correct: 0, winRate: 0 };
    byStrategy[p.strategy].total++;
    if (p.correct) byStrategy[p.strategy].correct++;

    // By confidence bucket
    const bucket = confidenceBucket(p.confidence);
    if (!byConfidenceBucket[bucket]) byConfidenceBucket[bucket] = { total: 0, correct: 0, winRate: 0 };
    byConfidenceBucket[bucket].total++;
    if (p.correct) byConfidenceBucket[bucket].correct++;
  }

  // Finalize win rates
  for (const v of Object.values(byStrategy)) v.winRate = v.total > 0 ? v.correct / v.total : 0;
  for (const v of Object.values(byConfidenceBucket)) v.winRate = v.total > 0 ? v.correct / v.total : 0;

  const avgConf = (subset: Prediction[]) =>
    subset.length > 0 ? subset.reduce((s, p) => s + p.confidence, 0) / subset.length : 0;

  return {
    totalPredictions: predictions.length,
    resolved: resolved.length,
    pending: predictions.length - resolved.length,
    correct: correct.length,
    incorrect: incorrect.length,
    winRate: resolved.length > 0 ? correct.length / resolved.length : 0,
    byStrategy,
    byConfidenceBucket,
    avgConfidenceWhenCorrect: avgConf(correct),
    avgConfidenceWhenIncorrect: avgConf(incorrect),
  };
}

/**
 * Per-strategy accuracy summary for the leaderboard overlay.
 * Only strategies with at least one resolved prediction are included.
 */
export interface StrategyAccuracy {
  strategyName: string;
  winRate: number;
  totalTrades: number;
  lastUpdated: string;
}

/**
 * Extract per-strategy accuracy from the full report.
 * Only includes strategies with at least one resolved prediction.
 * The returned totalTrades reflects resolved predictions (not total recorded).
 */
export function getAllStrategyAccuracy(): StrategyAccuracy[] {
  const report = getAccuracyReport();
  return Object.entries(report.byStrategy)
    .filter(([, s]) => s.total > 0)
    .map(([strategyName, s]) => ({
      strategyName,
      winRate: s.winRate,
      totalTrades: s.total,
      lastUpdated: new Date().toISOString(),
    }));
}

/** Print formatted accuracy report to logger (info level) */
export function printAccuracyReport(): void {
  const r = getAccuracyReport();
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  logger.info('=== PREDICTION ACCURACY REPORT ===');
  logger.info(`Total: ${r.totalPredictions} | Resolved: ${r.resolved} | Pending: ${r.pending}`);
  logger.info(`Correct: ${r.correct} | Incorrect: ${r.incorrect} | Win Rate: ${pct(r.winRate)}`);
  logger.info(`Avg confidence (correct): ${pct(r.avgConfidenceWhenCorrect)} | (incorrect): ${pct(r.avgConfidenceWhenIncorrect)}`);

  if (Object.keys(r.byStrategy).length > 0) {
    logger.info('--- By Strategy ---');
    for (const [strat, s] of Object.entries(r.byStrategy)) {
      logger.info(`  ${strat}: ${s.correct}/${s.total} (${pct(s.winRate)})`);
    }
  }

  if (Object.keys(r.byConfidenceBucket).length > 0) {
    logger.info('--- By Confidence Bucket ---');
    for (const [bucket, s] of Object.entries(r.byConfidenceBucket).sort()) {
      logger.info(`  [${bucket}]: ${s.correct}/${s.total} (${pct(s.winRate)})`);
    }
  }

  logger.info('==================================');
}

/** Start a background resolution checker. Returns the interval handle for cleanup. */
export function startResolutionChecker(intervalMs = 300_000): NodeJS.Timeout {
  logger.info('[AccuracyTracker] Starting resolution checker', { intervalMs });

  // Run once immediately, then on schedule
  checkResolutions().catch(err => logger.error('[AccuracyTracker] Initial check failed', { err }));

  return setInterval(() => {
    checkResolutions().catch(err => logger.error('[AccuracyTracker] Scheduled check failed', { err }));
  }, intervalMs);
}
