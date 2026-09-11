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
import {
  OMNIROUTE_URL,
  ChatMessage,
  RouterRequest,
  RouterResponse,
  HealthState,
  assertOmniRouteConfig,
} from './llm-router-types';
import { LlmSpendTracker, executeLlmEndpointCall } from './llm-router-executor';

export { OMNIROUTE_URL };
export type { ChatMessage, RouterRequest, RouterResponse };

export class LlmRouter extends EventEmitter {
  private config: LlmConfig;
  private health: Map<string, HealthState> = new Map();
  private spendTracker = new LlmSpendTracker();

  constructor(config?: Partial<LlmConfig>) {
    super();
    this.config = { ...loadLlmConfig(), ...config };
    assertOmniRouteConfig(this.config);

    const urls: string[] = [];
    for (const ep of [
      this.config.primary,
      this.config.fastTriage,
      this.config.fallback,
      this.config.qwen,
      this.config.cloud,
    ]) {
      if (ep?.url) urls.push(ep.url);
    }
    for (const url of urls) {
      if (!this.health.has(url)) {
        this.health.set(url, { healthy: true, lastCheck: 0, consecutiveFailures: 0 });
      }
    }
  }

  /** Deep reasoning route: DeepSeek R1 → Ollama → Claude cloud */
  async chat(request: RouterRequest): Promise<RouterResponse> {
    if (request.forceCloud && this.config.cloud && this.spendTracker.canSpendCloud(this.config.cloudDailyBudgetUsd)) {
      return this.callEndpoint(this.config.cloud, request, 'cloud');
    }

    const primaryUrl = this.config.primary.url;
    const fallbackUrl = this.config.fallback.url;

    if (this.isHealthy(primaryUrl)) {
      try {
        return await this.callEndpoint(this.config.primary, request, 'mlx');
      } catch {
        this.markUnhealthy(primaryUrl);
        this.emit('failover', { from: 'mlx', to: 'ollama' });
      }
    }

    if (this.isHealthy(fallbackUrl)) {
      try {
        return await this.callEndpoint(this.config.fallback, request, 'ollama');
      } catch {
        this.markUnhealthy(fallbackUrl);
        this.emit('failover', { from: 'ollama', to: 'cloud' });
      }
    }

    if (this.config.cloud && this.spendTracker.canSpendCloud(this.config.cloudDailyBudgetUsd)) {
      return this.callEndpoint(this.config.cloud, request, 'cloud');
    }

    throw new Error('All LLM endpoints unavailable');
  }

  /**
   * Qwen MoE long-context route: Qwen3-30B → DeepSeek R1 → Ollama → Claude cloud.
   * No-op (delegates to chat()) when LLM_QWEN_ENABLED is not 'true'.
   */
  async qwenChat(request: RouterRequest): Promise<RouterResponse> {
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
    return this.chat(request);
  }

  private async callEndpoint(
    endpoint: LlmEndpoint,
    request: RouterRequest,
    provider: 'mlx' | 'mlx-qwen' | 'ollama' | 'cloud'
  ): Promise<RouterResponse> {
    const res = await executeLlmEndpointCall(endpoint, request, provider);
    this.markHealthy(endpoint.url);
    if (provider === 'cloud') {
      this.spendTracker.trackCloudSpend(res.tokensUsed);
    }
    return res;
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

  getHealth(): Record<string, HealthState> {
    return Object.fromEntries(this.health);
  }

  getCloudSpend(): { spent: number; budget: number; remaining: number } {
    return this.spendTracker.getCloudSpend(this.config.cloudDailyBudgetUsd);
  }
}
