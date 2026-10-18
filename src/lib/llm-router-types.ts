/**
 * LLM Router Types and Configuration Assertions
 */

import { LlmEndpoint, LlmConfig } from '../shared/config/llm-config';

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

export interface HealthState {
  healthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
}

export function isLoopbackUrl(url: string): boolean {
  return (
    url === 'http://localhost:20128/v1' ||
    url === 'http://127.0.0.1:20128/v1' ||
    url === 'http://0.0.0.0:20128/v1' ||
    url.startsWith('http://localhost:') ||
    url.startsWith('http://127.0.0.1:') ||
    url.startsWith('http://0.0.0.0:')
  );
}

export function assertOmniRouteConfig(config: LlmConfig): void {
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

export function initEndpointHealthMap(config: LlmConfig): Map<string, HealthState> {
  const health = new Map<string, HealthState>();
  for (const ep of [config.primary, config.fastTriage, config.fallback, config.qwen, config.cloud]) {
    if (ep?.url && !health.has(ep.url)) {
      health.set(ep.url, { healthy: true, lastCheck: 0, consecutiveFailures: 0 });
    }
  }
  return health;
}

export function checkEndpointHealth(
  health: Map<string, HealthState>,
  url: string,
  healthCheckIntervalMs: number,
): boolean {
  const state = health.get(url);
  if (!state) return true;
  if (Date.now() - state.lastCheck > healthCheckIntervalMs) return true;
  return state.healthy;
}

export function recordEndpointHealthy(health: Map<string, HealthState>, url: string): void {
  health.set(url, { healthy: true, lastCheck: Date.now(), consecutiveFailures: 0 });
}

export function recordEndpointUnhealthy(health: Map<string, HealthState>, url: string): number {
  const state = health.get(url) || { healthy: false, lastCheck: 0, consecutiveFailures: 0 };
  state.healthy = false;
  state.lastCheck = Date.now();
  state.consecutiveFailures++;
  health.set(url, state);
  return state.consecutiveFailures;
}
