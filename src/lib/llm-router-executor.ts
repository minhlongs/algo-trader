/**
 * LLM Router Executor — Network request handling and spend tracking for LLM endpoints.
 */

import { LlmEndpoint } from '../shared/config/llm-config';
import type { RouterRequest, RouterResponse } from './llm-router-types';

export class LlmSpendTracker {
  private cloudSpendToday = 0;
  private cloudSpendResetDate = new Date().toDateString();

  canSpendCloud(cloudDailyBudgetUsd: number): boolean {
    const today = new Date().toDateString();
    if (today !== this.cloudSpendResetDate) {
      this.cloudSpendToday = 0;
      this.cloudSpendResetDate = today;
    }
    return this.cloudSpendToday < cloudDailyBudgetUsd;
  }

  trackCloudSpend(tokens: number): void {
    const costPer1k = 0.003;
    this.cloudSpendToday += (tokens / 1000) * costPer1k;
  }

  getCloudSpend(cloudDailyBudgetUsd: number): { spent: number; budget: number; remaining: number } {
    return {
      spent: this.cloudSpendToday,
      budget: cloudDailyBudgetUsd,
      remaining: cloudDailyBudgetUsd - this.cloudSpendToday,
    };
  }
}

export async function executeLlmEndpointCall(
  endpoint: LlmEndpoint,
  request: RouterRequest,
  provider: 'mlx' | 'mlx-qwen' | 'ollama' | 'cloud',
): Promise<RouterResponse> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs);

  try {
    const res = await fetch(`${endpoint.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider === 'cloud' && process.env.CLAUDE_API_KEY
          ? { 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' }
          : {}),
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: request.messages,
        max_tokens: request.maxTokens || endpoint.maxTokens,
        temperature: request.temperature ?? 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`LLM ${provider} error: ${res.status}`);

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };
    const latencyMs = Date.now() - start;
    const tokensUsed = data.usage?.total_tokens || 0;

    return {
      content: data.choices[0]?.message?.content || '',
      model: endpoint.model,
      provider,
      tokensUsed,
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}
