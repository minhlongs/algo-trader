/**
 * Signal Validator — prompt construction.
 * Split from signal-validator.ts (S16 tranche 3).
 */

import type { SignalCandidate } from './signal-validator-types';

/** Dynamic system prompt construction */
export function getCombinedSystemPrompt(): string {
  const qwenEnabled = process.env.SWARM_QWEN_ENABLED === 'true';
  const personasDescription = [
    `1. risk-analyst: Bias: downside protection. Focus: Is the edge real or a data artifact? Liquidity? Event risk? Slippage?`,
    `2. momentum-trader: Bias: capturing opportunity. Focus: Volume confirmation, timing, directional momentum, edge vs costs.`,
    `3. contrarian: Bias: questioning crowd wisdom. Focus: Too obvious? Are we exit liquidity? Herding risk? Info asymmetry?`,
  ];
  if (qwenEnabled) {
    personasDescription.push(
      `4. quantitative-analyst: Bias: mathematical rigor. Focus: Expected value, Kelly fraction, microstructure friction, z-score.`
    );
  }

  const allowedPersonas = qwenEnabled
    ? `"risk-analyst" | "momentum-trader" | "contrarian" | "quantitative-analyst"`
    : `"risk-analyst" | "momentum-trader" | "contrarian"`;

  return `You are a Polymarket arbitrage signal validator running a multi-persona debate panel.
Your job is to simulate a debate among specialized trading personas, reach consensus, and provide a final validation verdict.

The active personas are:
${personasDescription.join('\n')}

You must evaluate the signal from each persona's perspective. Then, synthesize the views to form a final consensus validation result.

Respond ONLY with a valid JSON object matching the following schema. Do not include markdown code fences (like \`\`\`json) or any explanation outside of the JSON.

JSON schema:
{
  "votes": [
    {
      "persona": ${allowedPersonas},
      "vote": "APPROVE" | "REJECT",
      "confidence": number (0.0 to 1.0),
      "reasoning": string (1-2 sentences)
    }
  ],
  "valid": boolean,
  "confidence": number (0.0 to 1.0),
  "reasoning": string (1-3 sentences of overall explanation),
  "risks": string[] (list of risk factors, empty array if none),
  "dissent": string | null (dissenting minority reasoning, or null if unanimous)
}`;
}

/** Build the user prompt from a signal candidate */
export function buildCombinedUserPrompt(signal: SignalCandidate): string {
  const marketLines = signal.markets
    .map(m => ` - ${m.title} (id=${m.id}) YES=${m.yesPrice.toFixed(3)} NO=${m.noPrice.toFixed(3)}`)
    .join('\n');

  return `Evaluate this Polymarket arbitrage signal candidate:

Signal type: ${signal.signalType}
Expected edge: ${(signal.expectedEdge * 100).toFixed(2)}%
Strategy reasoning: ${signal.reasoning}

Markets involved:
${marketLines}

Evaluate each of the active personas, generate their votes, and output the final validation decision.`;
}
