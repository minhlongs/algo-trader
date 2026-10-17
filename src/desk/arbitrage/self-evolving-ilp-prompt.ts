/**
 * Self-Evolving ILP Constraints Prompt and Impact Estimation
 *
 * @module desk/arbitrage/self-evolving-ilp-prompt
 */

import type { MissedOpportunity, CurrentConstraints, ConstraintSuggestion } from './self-evolving-ilp-constraints';

export function buildDeepSeekPrompt(opportunities: MissedOpportunity[], current: CurrentConstraints): string {
  const missedSummary = opportunities
    .map(o => `marketId=${o.marketId} edge=${(o.actualEdge * 100).toFixed(2)}% reason="${o.reason}"`)
    .join('\n');

  return `Given these missed arbitrage opportunities and current ILP constraints, suggest constraint modifications to capture more opportunities without increasing risk.

Current constraints:
- budget: ${current.budgetUsdc} USDC
- min_edge: ${(current.minEdge * 100).toFixed(2)}%
- max_market_exposure: ${(current.maxMarketExposure * 100).toFixed(1)}%

Missed opportunities (${opportunities.length}):
${missedSummary}

Respond ONLY with a JSON array. Each element must have:
- constraintName: string ("min_edge" or "max_market_exposure")
- currentValue: number (decimal fraction)
- suggestedValue: number (decimal fraction)
- reasoning: string (max 2 sentences)
- confidence: number (0.0–1.0)

Output nothing else.`;
}

export function estimateImpact(suggestions: ConstraintSuggestion[]): string {
  if (suggestions.length === 0) return 'no changes suggested';

  const edgeSuggestion = suggestions.find(s => s.constraintName === 'min_edge');
  if (edgeSuggestion && edgeSuggestion.suggestedValue < edgeSuggestion.currentValue) {
    const pct = ((edgeSuggestion.currentValue - edgeSuggestion.suggestedValue) / edgeSuggestion.currentValue * 100).toFixed(0);
    return `+${pct}% more opportunities captured (lower min_edge)`;
  }

  return `${suggestions.length} constraint(s) tuned`;
}
