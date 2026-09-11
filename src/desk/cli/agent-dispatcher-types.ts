import type { ModelTier } from '../../agents/agent-config';

export interface AgentExecutionContext {
  tenantId: string;
  strategyId?: string;
}

/** Agent input payload */
export type AgentInput = Record<string, unknown>;

/** Agent output data */
export type AgentOutputData = Record<string, unknown>;

export interface AgentExecutionResult {
  success: boolean;
  data?: AgentOutputData;
  error?: string;
  latencyMs: number;
  agentName: string;
  modelTier: ModelTier;
  jobId?: string; // For async Tier2 jobs
}
