/** Stub: Agent config types and tier definitions. */
export interface AgentConfig {
  name: string;
  tier: 'basic' | 'premium' | 'enterprise' | 'master';
  maxTokens: number;
  model?: string;
  endpoint?: string;
}

export interface TierConfig {
  endpoint: string;
  model: string;
  maxTokens: number;
  rateLimitRpm: number;
}

export const TIER_CONFIG: Record<string, TierConfig> = {
  basic: { endpoint: '', model: '', maxTokens: 4096, rateLimitRpm: 10 },
  premium: { endpoint: '', model: '', maxTokens: 8192, rateLimitRpm: 30 },
  enterprise: { endpoint: '', model: '', maxTokens: 16384, rateLimitRpm: 100 },
  master: { endpoint: '', model: '', maxTokens: 32768, rateLimitRpm: 300 },
};

export const TIER_CONFIGS = TIER_CONFIG;
