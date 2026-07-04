/**
 * Model Tier Dispatcher
 * Routes agent execution to appropriate LLM tier (Haiku/Sonnet/Opus)
 * based on agent configuration. Integrates with BullMQ for Tier2 async,
 * and uses circuit breaker for resilience.
 */

import { trace } from '@opentelemetry/api';
import { AgentQueueManager } from '../queues/agent-queue-manager';
import { OpenClawGateway } from '../workers/openclaw-gateway/client';
import { CircuitBreaker } from '../resilience/circuit-breaker';
import { AgentConfig, ModelTier, TIER_CONFIG, getAgentConfig } from '../agents/agent-config';

export interface AgentExecutionContext {
  tenantId: string;
  strategyId?: string;
}

export interface AgentExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  latencyMs: number;
  agentName: string;
  modelTier: ModelTier;
  jobId?: string; // For async Tier2 jobs
}

/**
 * Main dispatcher for tiered agent execution.
 */
export class ModelTierDispatcher {
  private tierQueues: Map<ModelTier, AgentQueueManager>;
  private gateway: OpenClawGateway;
  private circuitBreaker: CircuitBreaker;

  constructor(redisUrl: string) {
    this.tierQueues = new Map();
    this.gateway = new OpenClawGateway();
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60000,
      name: 'openclaw-gateway',
      onStateChange: (prev, next) => {
        console.log(`[ModelTierDispatcher] CircuitBreaker: ${prev} → ${next}`);
      },
    });

    // Initialize queue managers for tiers that have a queue (Tier2 and Tier3 fallback)
    for (const tier of [ModelTier.TIER2_SONNET, ModelTier.TIER3_OPUS]) {
      const config = TIER_CONFIG[tier];
      if (config.queueName) {
        const qm = new AgentQueueManager(
          redisUrl,
          config.queueName,
          config.maxConcurrent,
          config.rateLimit,
          tier // pass tier for metrics labeling
        );
        this.tierQueues.set(tier, qm);
      }
    }
  }

  /**
   * Execute an agent with automatic tier routing.
   * - Tier1 (Haiku): direct sync, <200ms
   * - Tier2 (Sonnet): async queue, returns jobId immediately
   * - Tier3 (Opus): direct sync with timeout, fallback to Tier2 on timeout/rate-limit
   */
  async execute(agentName: string, input: any, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const config = getAgentConfig(agentName);
    if (!config) {
      return {
        success: false,
        error: `Unknown agent: ${agentName}`,
        latencyMs: 0,
        agentName,
        modelTier: ModelTier.TIER1_HAIKU, // default to avoid undefined
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
      span.recordException(error as any);
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

  /**
   * Direct synchronous execution via OpenClawGateway.
   * Used for Tier1 and Tier3 (with optional fallback).
   */
  private async executeDirect(
    config: AgentConfig,
    input: any,
    context: AgentExecutionContext,
    enableFallback: boolean = false
  ): Promise<AgentExecutionResult> {
    const tierConfig = TIER_CONFIG[config.tier];
    const timeout = config.timeout || tierConfig.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.circuitBreaker.execute(() =>
        this.gateway.chat(config, input, { signal: controller.signal })
      );

      return {
        success: true,
        data: response,
        latencyMs: 0, // will be set by caller
        agentName: config.name,
        modelTier: config.tier,
      };
    } catch (error: any) {
      // Fallback to Tier2 if enabled and error is timeout or rate-limit (429)
      if (
        enableFallback &&
        config.fallbackTier &&
        (error.name === 'AbortError' || error.message.includes('429') || error.message.includes('rate limit'))
      ) {
        console.warn(`[ModelTierDispatcher] Tier3 timeout/rate-limit for ${config.name}, falling back to Tier2`);
        const result = await this.executeQueued({ ...config, tier: config.fallbackTier }, input, context);
        result.modelTier = config.fallbackTier;
        return result;
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: 0,
        agentName: config.name,
        modelTier: config.tier,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Queue-based asynchronous execution for Tier2 (and Tier3 fallback).
   * Returns immediately with job ID; result delivered via worker.
   */
  private async executeQueued(config: AgentConfig, input: any, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const queue = this.tierQueues.get(config.tier);
    if (!queue) {
      throw new Error(`No queue configured for tier: ${config.tier}`);
    }

    const job = await queue.add(config.name, {
      agentName: config.name,
      input,
      context: { tenantId: context.tenantId, strategyId: context.strategyId },
    });

    return {
      success: true,
      jobId: job.id,
      data: { status: 'queued' },
      latencyMs: 0,
      agentName: config.name,
      modelTier: config.tier,
    };
  }

  /**
   * Start workers for processing queued tasks.
   * Pass a map keyed by ModelTier for the tiers you want to process.
   * Example: { [ModelTier.TIER2_SONNET]: async (task) => { ... } }
   */
  async startWorkers(processors: Partial<Record<ModelTier, (task: any) => Promise<any>>>): Promise<void> {
    for (const [tier, processor] of Object.entries(processors) as [ModelTier, (task: any) => Promise<any>][]) {
      const queue = this.tierQueues.get(tier);
      if (queue && processor) {
        await queue.startWorker(processor);
      }
    }
  }

  /**
   * Get queue statistics for monitoring.
   */
  getQueueStats(): Map<ModelTier, any> {
    const stats = new Map<ModelTier, any>();
    for (const [tier, qm] of this.tierQueues.entries()) {
      stats.set(tier, qm.getQueueStats());
    }
    return stats;
  }

  /**
   * Graceful shutdown of all queues.
   */
  async close(): Promise<void> {
    for (const qm of this.tierQueues.values()) {
      await qm.close();
    }
  }
}

/**
 * Factory function for creating dispatcher.
 */
export function createModelTierDispatcher(redisUrl: string): ModelTierDispatcher {
  return new ModelTierDispatcher(redisUrl);
}
