/**
 * Agent Configuration Registry
 * Defines model tier assignments, timeouts, and priorities for all AI agents.
 * Also provides tier-level configuration for endpoints, models, and concurrency.
 */

export enum ModelTier {
  TIER1_HAIKU = 'haiku',      // Fast scanning, <100ms
  TIER2_SONNET = 'sonnet',    // Async analysis, <500ms
  TIER3_OPUS = 'opus',        // Critical decisions, <2s
}

export interface AgentConfig {
  name: string;
  tier: ModelTier;
  priority: number;           // Queue priority (1-5, 1=highest)
  timeout: number;            // milliseconds
  fallbackTier?: ModelTier;   // Optional fallback tier (e.g., Opus -> Sonnet)
  maxTokens?: number;         // Optional token limit per call
  batchSize?: number;         // Optional batch size for batchable agents
}

// Tier-level configuration (shared settings for all agents in a tier)
export const TIER_CONFIG: Record<ModelTier, {
  model: string;
  endpoint: string;
  defaultTimeout: number;
  maxConcurrent: number;
  queueName: string | null;
  rateLimit: number;
}> = {
  [ModelTier.TIER1_HAIKU]: {
    model: 'claude-3-haiku-20240307',
    endpoint: process.env.OPENCLAW_SCANNER_URL || 'http://localhost:11436/v1',
    defaultTimeout: 200,
    maxConcurrent: 50,
    queueName: null, // sync execution
    rateLimit: 100,
  },
  [ModelTier.TIER2_SONNET]: {
    model: 'claude-3.5-sonnet-20241022',
    endpoint: process.env.OPENCLAW_ANALYSIS_URL || 'http://localhost:11435/v1',
    defaultTimeout: 1000,
    maxConcurrent: 20,
    queueName: 'agent-analysis-queue',
    rateLimit: 50,
  },
  [ModelTier.TIER3_OPUS]: {
    model: 'claude-3-opus-20240229',
    endpoint: process.env.OPENCLAW_CRITICAL_URL || 'http://localhost:11434/v1',
    defaultTimeout: 3000,
    maxConcurrent: 10,
    queueName: 'agent-critical-queue',
    rateLimit: 20,
  },
};

// Central registry of agent configurations (all 19 agents)
export const AGENT_CONFIGS: AgentConfig[] = [
  // Intelligence layer — DeepSeek / Claude agents
  { name: 'signal-validator', tier: ModelTier.TIER3_OPUS, priority: 1, timeout: 2000, fallbackTier: ModelTier.TIER2_SONNET },
  { name: 'signal-fusion-engine', tier: ModelTier.TIER2_SONNET, priority: 1, timeout: 500 },
  { name: 'dual-level-reflection-engine', tier: ModelTier.TIER3_OPUS, priority: 2, timeout: 1500 },
  { name: 'kronos-fair-value', tier: ModelTier.TIER2_SONNET, priority: 3, timeout: 450 },
  { name: 'prediction-accuracy-tracker', tier: ModelTier.TIER1_HAIKU, priority: 4, timeout: 100 },
  { name: 'relationship-graph-builder', tier: ModelTier.TIER2_SONNET, priority: 2, timeout: 500 },
  { name: 'signal-consensus-swarm', tier: ModelTier.TIER3_OPUS, priority: 1, timeout: 2500, fallbackTier: ModelTier.TIER2_SONNET },
  { name: 'market-context-builder', tier: ModelTier.TIER2_SONNET, priority: 3, timeout: 450 },

  // Dark edge & strategy agents (Polymarket)
  { name: 'whale-copy-trader', tier: ModelTier.TIER1_HAIKU, priority: 5, timeout: 150 },
  { name: 'btc-fifteen-minute-strategy', tier: ModelTier.TIER1_HAIKU, priority: 5, timeout: 100 },
  { name: 'cycle-end-sniper', tier: ModelTier.TIER2_SONNET, priority: 2, timeout: 600 },

  // Additional agents to reach 19
  { name: 'arbitrage-scanner', tier: ModelTier.TIER1_HAIKU, priority: 5, timeout: 150 },
  { name: 'orderbook-depth-analyzer', tier: ModelTier.TIER1_HAIKU, priority: 5, timeout: 120 },
  { name: 'market-regime-detector', tier: ModelTier.TIER1_HAIKU, priority: 4, timeout: 100 },
  { name: 'triangular-arbitrage-scanner', tier: ModelTier.TIER1_HAIKU, priority: 5, timeout: 180 },
  { name: 'funding-rate-arbitrage-scanner', tier: ModelTier.TIER1_HAIKU, priority: 5, timeout: 150 },
  { name: 'resolution-criteria-analyzer', tier: ModelTier.TIER2_SONNET, priority: 3, timeout: 500 },
  { name: 'whale-activity-feed', tier: ModelTier.TIER1_HAIKU, priority: 6, timeout: 200 },
  { name: 'semantic-dependency-discovery', tier: ModelTier.TIER2_SONNET, priority: 2, timeout: 600 },
];

/**
 * Look up agent configuration by name.
 */
export function getAgentConfig(name: string): AgentConfig | undefined {
  return AGENT_CONFIGS.find(c => c.name === name);
}
