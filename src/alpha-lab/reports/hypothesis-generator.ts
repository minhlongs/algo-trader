/**
 * Hypothesis Generator
 *
 * Deterministic, rule-based pattern detector that produces structured
 * hypotheses from evaluation results. No LLM calls, no randomness,
 * no side effects — pure function: same input -> identical output.
 */

import type { EvaluationReport } from '../evaluation/evaluation-types';
import type { CandidateResult } from '../attribution/alpha-evaluator';
import type { BaselineRun } from '../baselines/baseline-runner';
import {
  detectRegimeFilter,
  detectStopLoss,
  detectDrawdown,
  detectProfitFactor,
  detectSeasonality,
  detectVolatilityDegradation,
  detectOverfit,
  detectSmallSample,
} from './hypothesis-rules';

export interface Hypothesis {
  name: string;
  description: string;
  features: string[];
  regimeFilter: 'all' | string[];
  entryCondition: string;
  exitCondition: string;
  expectedMechanism: string;
  confidence: number;
  evidence: string[];
}

export interface GenerateInput {
  evaluation: EvaluationReport;
  candidate?: CandidateResult;
  baselines?: BaselineRun[];
  previousHypotheses?: string[];
}

const MAX_HYPOTHESES = 8;

/**
 * Generate structured hypotheses from evaluation results.
 * Pure, deterministic, no side effects — same input always produces same output.
 */
export function generateHypotheses(input: GenerateInput): Hypothesis[] {
  const { evaluation, candidate, baselines, previousHypotheses } = input;
  const prevSet = new Set(previousHypotheses ?? []);

  const candidates: Hypothesis[] = [
    ...detectRegimeFilter(evaluation),
    ...detectStopLoss(evaluation),
    ...detectDrawdown(evaluation),
    ...detectProfitFactor(evaluation),
    ...detectSeasonality(evaluation),
    ...detectVolatilityDegradation(evaluation),
    ...(candidate && baselines ? detectOverfit(candidate, baselines) : []),
    ...detectSmallSample(evaluation),
  ];

  return candidates
    .filter((h) => !prevSet.has(h.name))
    .slice(0, MAX_HYPOTHESES);
}

/**
 * Human-readable multi-line summary of hypotheses for CLI/report output.
 */
export function summarizeHypotheses(hypotheses: Hypothesis[]): string {
  if (hypotheses.length === 0) return 'No hypotheses generated.';

  const lines: string[] = [`Hypotheses (${hypotheses.length}):\n`];
  for (let i = 0; i < hypotheses.length; i++) {
    const h = hypotheses[i]!;
    lines.push(
      `${i + 1}. [${h.confidence.toFixed(2)}] ${h.name}`,
      `   ${h.description}`,
      `   Features: ${h.features.join(', ')}`,
      `   Regime: ${typeof h.regimeFilter === 'string' ? h.regimeFilter : h.regimeFilter.join(', ')}`,
      '',
    );
  }
  return lines.join('\n');
}
