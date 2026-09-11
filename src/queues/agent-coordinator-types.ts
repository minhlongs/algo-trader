/**
 * Agent Coordinator Types
 * Priority enums and task/result interfaces for BullMQ agent queues.
 */

export enum AgentPriority {
  CRITICAL = 1, // Tier 1 - bypass queue if possible, fast path
  NORMAL = 2, // Tier 2 - standard queued processing
  BACKGROUND = 3, // Tier 3 - best effort, can be delayed
}

export interface AgentTask {
  agentName: string;
  input: Record<string, unknown>;
  context: {
    tenantId: string;
    strategyId?: string;
    priority: AgentPriority;
    timeout: number; // ms
    callbackUrl?: string; // For async result delivery
  };
}

export interface AgentResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  latencyMs: number;
  agentName: string;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}
