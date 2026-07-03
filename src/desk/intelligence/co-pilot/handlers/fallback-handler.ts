/**
 * Fallback Handler
 * Returns structured intent listing when query cannot be classified.
 * AlphaEar does NOT support free-text chat — no LLM fallback.
 */

import type { CopilotResponse } from '../response-formatter';

export function handleFallback(): CopilotResponse {
  const answer = [
    'I can help with these trading questions:\n',
    '1. **Risk Assessment** — \'What is my risk exposure?\'',
    '2. **Arb Scan** — \'Find arbitrage opportunities\'',
    '3. **Strategy Performance** — \'How are my strategies doing?\'',
    '4. **Market Regime** — \'What is the market doing?\'',
    '5. **Weekly Report** — \'Generate a weekly report\'',
    '',
    'Try one of the quick actions below!',
  ].join('\n');

  return {
    answer,
    actions: [
      { label: 'Risk Assessment', action: 'execute', payload: 'risk_assessment' },
      { label: 'Scan Arb', action: 'execute', payload: 'arb_scan' },
      { label: 'Performance', action: 'execute', payload: 'strategy_performance' },
      { label: 'Market Regime', action: 'execute', payload: 'market_regime' },
      { label: 'Generate Report', action: 'execute', payload: 'weekly_report' },
    ],
  };
}
