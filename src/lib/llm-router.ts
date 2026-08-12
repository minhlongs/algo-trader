/**
 * LLM Router — Routes requests to bare-metal MLX servers on M1 Max host.
 *
 * Three routing modes:
 * chat() — DeepSeek R1 (deep reasoning) → Ollama → Claude cloud
 * fastChat() — Nemotron Nano (fast triage) → DeepSeek R1 → Ollama → Claude
 * qwenChat() — Qwen3-30B MoE (long-context) → DeepSeek R1 → Ollama → Claude
 * Gated by LLM_QWEN_ENABLED=true. Falls back to chat() if disabled/unhealthy.
 *
 * OpenAI-compatible /v1/chat/completions for all providers.
 */

import { EventEmitter } from 'events';
import { loadLlmConfig, LlmEndpoint, LlmConfig } from '../shared/config/llm-config';

/**
 * Mandatory OmniRoute gateway — all local MLX traffic must resolve through it.
 * Override via OMNIROUTE_URL env var (e.g., Cloudflare Tunnel hostname).
 * Default: http://omnimbp.local:20128/v1 (local M1 Max LAN)
 */
export const OMNIROUTE_URL = process.env.OMNIROUTE_URL || 'http://omnimbp.local:20128/v1';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RouterRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  forceCloud?: boolean;
}

export interface RouterResponse {
  content: string;
  model: string;
  provider: 'mlx' | 'mlx-qwen' | 'ollama' | 'cloud';
  tokensUsed: number;
  latencyMs: number;
}

interface HealthState {
  healthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
}

function isLoopbackUrl(url: string): boolean {
  return (
    url === 'http://localhost:20128/v1' ||
    url === 'http://127.0.0.1:20128/v1' ||
    url === 'http://0.0.0.0:20128/v1' ||
    url.startsWith('http://localhost:') ||
    url.startsWith('http://127.0.0.1:') ||
    url.startsWith('http://0.0.0.0:')
  );
}

function assertOmniRouteConfig(config: LlmConfig): void {
  const endpoints: { name: string; endpoint?: LlmEndpoint }[] = [
    { name: 'primary', endpoint: config.primary },
    { name: 'fastTriage', endpoint: config.fastTriage },
    { name: 'fallback', endpoint: config.fallback },
    { name: 'qwen', endpoint: config.qwen },
    { name: 'cloud', endpoint: config.cloud },
  ];

  for (const { name, endpoint } of endpoints) {
    if (!endpoint) continue;
    if (endpoint.url === OMNIROUTE_URL) continue;
    if (isLoopbackUrl(endpoint.url)) continue;
    throw new Error(
      `OmniRoute violation: ${name} endpoint URL "${endpoint.url}" is not the mandatory OmniRoute gateway (${OMNIROUTE_URL}). ` +
      `All MLX traffic must resolve through OmniRoute.`,
    );
  }
}

export class LlmRouter extends EventEmitter {
  private config: LlmConfig;
  private health: Map<string, HealthState> = new Map();
  private cloudSpendToday = 0;
  private cloudSpendResetDate = new Date().toDateString();

  constructor(config?: Partial<LlmConfig>) {
    super();
    this.config = { ...loadLlmConfig(), ...config };
    assertOmniRouteConfig(this.config);
  }

  /** Deep reasoning route: DeepSeek R1 → Ollama → Claude cloud */
  async chat(request: RouterRequest): Promise<RouterResponse> {
    if (request.forceCloud && this.config.cloud) {
      return this.callEndpoint(this.config.cloud, request, 'cloud');
    }

    // Try primary (DeepSeek R1 — deep reasoning, ~10 tok/s)
    if (this.isHealthy(this.config.primary.url)) {
      try {
        return await this.callEndpoint(this.config.primary, request, 'mlx');
      } catch {
        this.markUnhealthy(this.config.primary.url);
        this.emit('failover', { from: 'mlx', to: 'ollama' });
      }
    }

    // Try fallback (Ollama)
    try {
      return await this.callEndpoint(this.config.fallback, request, 'ollama');
    } catch {
      this.markUnhealthy(this.config.fallback.url);
      this.emit('failover', { from: 'ollama', to: 'cloud' });
    }

    // Last resort: cloud
    if (this.config.cloud && this.canSpendCloud()) {
      return this.callEndpoint(this.config.cloud, request, 'cloud');
    }

    throw new Error('All LLM endpoints unavailable');
  }

  /**
   * Qwen MoE long-context route: Qwen3-30B → DeepSeek R1 → Ollama → Claude cloud.
   * No-op (delegates to chat()) when LLM_QWEN_ENABLED is not 'true'.
   * Best for: deep statistical reasoning, long market context, multi-step analysis.
   */
  async qwenChat(request: RouterRequest): Promise<RouterResponse> {
    // Feature-flag: if Qwen not configured, fall straight through to chat()
    if (!this.config.qwen) {
      return this.chat(request);
    }

    if (this.isHealthy(this.config.qwen.url)) {
      try {
        return await this.callEndpoint(this.config.qwen, request, 'mlx-qwen');
      } catch {
        this.markUnhealthy(this.config.qwen.url);
        this.emit('failover', { from: 'mlx-qwen', to: 'mlx-primary' });
      }
    }

    // Qwen unhealthy — fall through to existing chat() chain
    return this.chat(request);
  }

  /** Fast triage route: Nemotron Nano (~45 tok/s) → falls back to chat() chain */
  async fastChat(request: RouterRequest): Promise<RouterResponse> {
    if (this.isHealthy(this.config.fastTriage.url)) {
      try {
        return await this.callEndpoint(this.config.fastTriage, request, 'mlx');
      } catch {
        this.markUnhealthy(this.config.fastTriage.url);
        this.emit('failover', { from: 'mlx-fast', to: 'mlx-primary' });
      }
    }
    // Fall through to regular chain
    return this.chat(request);
  }

  private async callEndpoint(
    endpoint: LlmEndpoint,
    request: RouterRequest,
    provider: 'mlx' | 'mlx-qwen' | 'ollama' | 'cloud'
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

      this.markHealthy(endpoint.url);

      if (provider === 'cloud') {
        this.trackCloudSpend(tokensUsed);
      }

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

  private isHealthy(url: string): boolean {
    const state = this.health.get(url);
    if (!state) return true;
    if (Date.now() - state.lastCheck > this.config.healthCheckIntervalMs) return true;
    return state.healthy;
  }

  private markHealthy(url: string): void {
    this.health.set(url, { healthy: true, lastCheck: Date.now(), consecutiveFailures: 0 });
  }

  private markUnhealthy(url: string): void {
    const state = this.health.get(url) || { healthy: false, lastCheck: 0, consecutiveFailures: 0 };
    state.healthy = false;
    state.lastCheck = Date.now();
    state.consecutiveFailures++;
    this.health.set(url, state);
    this.emit('unhealthy', { url, failures: state.consecutiveFailures });
  }

  private canSpendCloud(): boolean {
    const today = new Date().toDateString();
    if (today !== this.cloudSpendResetDate) {
      this.cloudSpendToday = 0;
      this.cloudSpendResetDate = today;
    }
    return this.cloudSpendToday < this.config.cloudDailyBudgetUsd;
  }

  private trackCloudSpend(tokens: number): void {
    const costPer1k = 0.003;
    this.cloudSpendToday += (tokens / 1000) * costPer1k;
  }

  getHealth(): Record<string, HealthState> {
    return Object.fromEntries(this.health);
  }

  getCloudSpend(): { spent: number; budget: number; remaining: number } {
    return {
      spent: this.cloudSpendToday,
      budget: this.config.cloudDailyBudgetUsd,
      remaining: this.config.cloudDailyBudgetUsd - this.cloudSpendToday,
    };
  }
}
