/**
 * Model Tier Dispatcher
 * Routes agent execution to appropriate LLM tier (Haiku/Sonnet/Opus)
 * based on agent configuration. Integrates with BullMQ for Tier2 async,
 * and uses circuit breaker for resilience.
 */

import { trace } from '@opentelemetry/api';
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
import { executeDirectCall, executeQueuedCall } from './agent-dispatcher-executor';
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
   * - Tier1 (Haiku): direct sync, <200ms
   * - Tier2 (Sonnet): async queue, returns jobId immediately
   * - Tier3 (Opus): direct sync with timeout, fallback to Tier2 on timeout/rate-limit
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

    const tracer = trace.getTracer('algo-trader-agent');
    const span = tracer.startSpan(`agent.${agentName}`, {
      attributes: {
        'agent.name': agentName,
        'agent.tier': config.tier,
        'tenant.id': context.tenantId,
        'agent.priority': config.priority,
        'cloud.region': process.env.REGION || 'unknown',
        'deployment.environment': process.env.ENVIRONMENT || 'development',
      },
    });

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

      const latency = Date.now() - start;
      result.latencyMs = latency;
      result.agentName = agentName;

      span.setAttributes({
        'agent.latency_ms': latency,
        'agent.success': result.success,
        'agent.model_tier': result.modelTier,
        ...(result.jobId && { 'agent.job_id': result.jobId }),
        ...(result.error && { 'agent.error': result.error }),
      });

      return result;
    } catch (error) {
      const latency = Date.now() - start;
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setAttributes({
        'agent.latency_ms': latency,
        'agent.success': false,
        'agent.error': error instanceof Error ? error.message : String(error),
        'agent.model_tier': config.tier,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: latency,
        agentName,
        modelTier: config.tier,
      };
    } finally {
      span.end();
    }
  }

  private async executeDirect(
    config: AgentConfig,
    input: AgentInput,
    context: AgentExecutionContext,
    enableFallback: boolean = false,
  ): Promise<AgentExecutionResult> {
    return executeDirectCall(
      {
        gateway: this.gateway,
        circuitBreaker: this.circuitBreaker,
        tierQueues: this.tierQueues,
      },
      config,
      input,
      context,
      enableFallback,
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

  getQueueStats(): Map<ModelTier, any> {
    return collectQueueStats(this.tierQueues);
  }

  async close(): Promise<void> {
    return closeTierQueues(this.tierQueues);
  }
}

export function createModelTierDispatcher(redisUrl: string): ModelTierDispatcher {
  return new ModelTierDispatcher(redisUrl);
}
