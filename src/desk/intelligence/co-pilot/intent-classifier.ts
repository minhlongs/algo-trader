/**
 * Intent Classifier
 * Keyword-based classification for Co-pilot queries.
 * 5 predefined intents + fallback with confidence threshold >= 0.5.
 */

export type Intent = 'risk_assessment' | 'arb_scan' | 'strategy_performance' | 'market_regime' | 'weekly_report' | 'fallback';

export interface ClassifiedIntent {
  intent: Intent;
  confidence: number;
}

// Intent keyword patterns (ordered by specificity within each intent)
const INTENT_PATTERNS: Record<Exclude<Intent, 'fallback'>, RegExp[]> = {
  risk_assessment: [
    /risk/i, /exposure/i, /drawdown/i, /overexposed/i,
    /circuit.?breaker/i, /position.?size/i, /capital.?at.?risk/i,
  ],
  arb_scan: [
    /arb(?:itrage)?/i, /opportunit/i, /mispric/i, /spread/i,
    /hedge/i, /cross.?market/i, /price.?gap/i,
  ],
  strategy_performance: [
    /strategy/i, /performance/i, /win.?rate/i, /sharpe/i,
    /p&l/i, /profit/i, /pnl/i, /return/i, /accuracy/i,
  ],
  market_regime: [
    /regime/i, /market (?:doing|trend|state)/i, /trending/i,
    /ranging/i, /bull/i, /bear/i, /volatil/i,
  ],
  weekly_report: [
    /report/i, /summary/i, /weekly/i, /overview/i, /digest/i,
    /recap/i, /roundup/i,
  ],
};

/**
 * Score a query against a single intent's patterns.
 * Returns the fraction of patterns that matched.
 */
function scoreIntent(query: string, patterns: RegExp[]): number {
  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(query)) {
      matches++;
    }
  }
  return patterns.length > 0 ? matches / patterns.length : 0;
}

/**
 * Classify a natural language query into a co-pilot intent.
 *
 * Returns the highest-confidence match where confidence >= 0.5.
 * If no pattern reaches the threshold, returns fallback with confidence 0.
 */
export function classifyIntent(query: string): ClassifiedIntent {
  if (!query || query.trim().length === 0) {
    return { intent: 'fallback', confidence: 0 };
  }

  const normalizedQuery = query.trim();

  let bestIntent: Intent = 'fallback';
  let bestScore = 0;

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    const score = scoreIntent(normalizedQuery, patterns);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent as Exclude<Intent, 'fallback'>;
    }
  }

  // Confidence threshold: only route if >= 0.5
  if (bestScore >= 0.5) {
    return { intent: bestIntent, confidence: bestScore };
  }

  return { intent: 'fallback', confidence: 0 };
}
