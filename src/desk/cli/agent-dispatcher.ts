/**
 * Model Tier Dispatcher
 * Routes agent execution to appropriate LLM tier (Haiku/Sonnet/Opus)
 * based on agent configuration. Integrates with BullMQ for Tier2 async,
 * and uses circuit breaker for resilience.
 */

import { AgentQueueManager } from '../../queues/agent-queue-manager';
import { CircuitBreaker } from '../../shared/resilience/circuit-breaker';
import { logger } from '../../shared/utils/logger';
import { AgentConfig, ModelTier, getAgentConfig } from '../../agents/agent-config';
import { OpenClawGateway } from '../../platform/workers/openclaw-gateway/client';
import type {
  AgentExecutionContext,
  AgentInput,
  AgentOutputData,
  AgentExecutionResult,
} from './agent-dispatcher-types';
import {
  executeDirectCall,
  executeQueuedCall,
  startAgentSpan,
  recordAgentSpanResult,
  recordAgentSpanFailure,
} from './agent-dispatcher-executor';
import {
  initTierQueues,
  startWorkerQueues,
  collectQueueStats,
  closeTierQueues,
} from './agent-dispatcher-queues';

export type {
  AgentExecutionContext,
  AgentInput,
  AgentOutputData,
  AgentExecutionResult,
} from './agent-dispatcher-types';

export class ModelTierDispatcher {
  private tierQueues: Map<ModelTier, AgentQueueManager>;
  private circuitBreaker: CircuitBreaker;
  private gateway: OpenClawGateway;

  constructor(redisUrl: string, gateway?: OpenClawGateway) {
    this.gateway = gateway ?? new OpenClawGateway();
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60000,
      name: 'openclaw-gateway',
      onStateChange: (prev, next) => {
        logger.debug(`[ModelTierDispatcher] CircuitBreaker: ${prev} -> ${next}`);
      },
    });
    this.tierQueues = initTierQueues(redisUrl);
  }

  /**
   * Execute an agent with automatic tier routing.
   */
  async execute(agentName: string, input: AgentInput, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const config = getAgentConfig(agentName);
    if (!config) {
      return {
        success: false,
        error: `Unknown agent: ${agentName}`,
        latencyMs: 0,
        agentName,
        modelTier: ModelTier.TIER1_HAIKU,
      };
    }

    const span = startAgentSpan(agentName, config, context);
    const start = Date.now();

    try {
      let result: AgentExecutionResult;

      switch (config.tier) {
        case ModelTier.TIER1_HAIKU:
          result = await this.executeDirect(config, input, context);
          break;
        case ModelTier.TIER2_SONNET:
          result = await this.executeQueued(config, input, context);
          break;
        case ModelTier.TIER3_OPUS:
          result = await this.executeDirect(config, input, context, true);
          break;
        default:
          throw new Error(`Unsupported tier: ${config.tier}`);
      }

      return recordAgentSpanResult(span, result, agentName, Date.now() - start);
    } catch (error) {
      return recordAgentSpanFailure(span, error, config, agentName, Date.now() - start);
    } finally {
      span.end();
    }
  }

  private async executeDirect(
    config: AgentConfig,
    input: AgentInput,
    context: AgentExecutionContext,
    enableFallback = false,
  ): Promise<AgentExecutionResult> {
    return executeDirectCall(
      { gateway: this.gateway, circuitBreaker: this.circuitBreaker, tierQueues: this.tierQueues },
      config, input, context, enableFallback,
    );
  }

  private async executeQueued(config: AgentConfig, input: AgentInput, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    return executeQueuedCall(this.tierQueues, config, input, context);
  }

  async startWorkers(
    processors: Partial<Record<ModelTier, (task: AgentInput) => Promise<AgentOutputData>>>,
  ): Promise<void> {
    return startWorkerQueues(this.tierQueues, processors);
  }

  getQueueStats(): ReturnType<typeof collectQueueStats> {
    return collectQueueStats(this.tierQueues);
  }

  async close(): Promise<void> {
    return closeTierQueues(this.tierQueues);
  }
}

export function createModelTierDispatcher(redisUrl: string): ModelTierDispatcher {
  return new ModelTierDispatcher(redisUrl);
}
