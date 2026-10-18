import { trace, type Span } from '@opentelemetry/api';
import { logger } from '../../shared/utils/logger';
import { AgentConfig, ModelTier, TIER_CONFIG } from '../../agents/agent-config';
import { OpenClawGateway } from '../../platform/workers/openclaw-gateway/client';
import { CircuitBreaker } from '../../shared/resilience/circuit-breaker';
import { AgentQueueManager } from '../../queues/agent-queue-manager';
import type {
  AgentExecutionContext, AgentInput, AgentOutputData, AgentExecutionResult,
} from './agent-dispatcher-types';

export interface DispatcherDependencies {
  gateway: OpenClawGateway;
  circuitBreaker: CircuitBreaker;
  tierQueues: Map<ModelTier, AgentQueueManager>;
}

export function startAgentSpan(
  agentName: string,
  config: AgentConfig,
  context: AgentExecutionContext,
): Span {
  const tracer = trace.getTracer('algo-trader-agent');
  return tracer.startSpan(`agent.${agentName}`, {
    attributes: {
      'agent.name': agentName,
      'agent.tier': config.tier,
      'tenant.id': context.tenantId,
      'agent.priority': config.priority,
      'cloud.region': process.env.REGION || 'unknown',
      'deployment.environment': process.env.ENVIRONMENT || 'development',
    },
  });
}

export function recordAgentSpanResult(
  span: Span,
  result: AgentExecutionResult,
  agentName: string,
  latency: number,
): AgentExecutionResult {
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
}

export function recordAgentSpanFailure(
  span: Span,
  error: unknown,
  config: AgentConfig,
  agentName: string,
  latency: number,
): AgentExecutionResult {
  const errMsg = error instanceof Error ? error.message : String(error);
  span.recordException(error instanceof Error ? error : new Error(errMsg));
  span.setAttributes({
    'agent.latency_ms': latency,
    'agent.success': false,
    'agent.error': errMsg,
    'agent.model_tier': config.tier,
  });
  return { success: false, error: errMsg, latencyMs: latency, agentName, modelTier: config.tier };
}

/**
 * Direct synchronous execution via fetch to LLM endpoint.
 * Used for Tier1 and Tier3 (with optional fallback to Tier2).
 */
export async function executeDirectCall(
  deps: DispatcherDependencies,
  config: AgentConfig,
  input: AgentInput,
  context: AgentExecutionContext,
  enableFallback: boolean = false,
): Promise<AgentExecutionResult> {
  const tierConfig = TIER_CONFIG[config.tier];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), tierConfig.defaultTimeout);

  try {
    const response = await deps.circuitBreaker.execute(async () => {
      return await deps.gateway.chat(config, input, { signal: controller.signal });
    });

    return {
      success: true, data: response as AgentOutputData,
      latencyMs: 0, agentName: config.name, modelTier: config.tier,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : '';
    if (enableFallback && config.fallbackTier && (errorName === 'AbortError' || errorMsg.includes('429') || errorMsg.includes('rate limit'))) {
      logger.warn(`[ModelTierDispatcher] Tier3 timeout/rate-limit for ${config.name}, falling back to Tier2`);
      const result = await executeQueuedCall(deps.tierQueues, { ...config, tier: config.fallbackTier }, input, context);
      result.modelTier = config.fallbackTier;
      return result;
    }
    return { success: false, error: errorMsg, latencyMs: 0, agentName: config.name, modelTier: config.tier };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Queue-based asynchronous execution for Tier2 (and Tier3 fallback).
 * Returns immediately with job ID; result delivered via worker.
 */
export async function executeQueuedCall(
  tierQueues: Map<ModelTier, AgentQueueManager>,
  config: AgentConfig,
  input: AgentInput,
  context: AgentExecutionContext,
): Promise<AgentExecutionResult> {
  const queue = tierQueues.get(config.tier);
  if (!queue) throw new Error(`No queue configured for tier: ${config.tier}`);

  const job = await queue.add(config.name, {
    agentName: config.name,
    input,
    context: { tenantId: context.tenantId, strategyId: context.strategyId },
  });

  return {
    success: true, jobId: job.id, data: { status: 'queued' },
    latencyMs: 0, agentName: config.name, modelTier: config.tier,
  };
}
