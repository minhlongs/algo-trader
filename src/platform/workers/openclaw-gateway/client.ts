/**
 * OpenClaw Gateway Client
 * Unified interface to tiered LLM endpoints (Haiku/Sonnet/Opus).
 * Used by ModelTierDispatcher to route agent execution.
 */

import { AgentConfig, TIER_CONFIG } from '../../agents/agent-config';
import { recordExternalApiLatency } from '../../middleware/prometheus-metrics';

export class OpenClawGateway {
  /**
   * Execute an agent via the appropriate LLM endpoint.
   * @param config Agent configuration (provides tier and timeout)
   * @param input Agent input payload (will be JSON-stringified)
   * @param options AbortSignal for timeout cancellation
   */
  async chat(config: AgentConfig, input: any, options: { signal?: AbortSignal } = {}): Promise<any> {
    const tierConfig = TIER_CONFIG[config.tier];
    if (!tierConfig) {
      throw new Error(`OpenClawGateway: unknown tier ${config.tier}`);
    }

    const start = Date.now();
    try {
      const response = await fetch(tierConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: options.signal,
        body: JSON.stringify({
          model: tierConfig.model,
          messages: [{ role: 'user', content: JSON.stringify(input) }],
          max_tokens: config.maxTokens || 4096,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenClaw error: ${response.status} - ${err}`);
      }

      return response.json();
    } finally {
      const latencySec = (Date.now() - start) / 1000;
      // Record latency with region derived from endpoint or default
      const region = process.env.REGION || 'unknown';
      recordExternalApiLatency('openclaw', config.name, region, latencySec);
    }
  }
}
