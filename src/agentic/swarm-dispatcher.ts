/**
 * Autonomy Swarm Dispatcher
 *
 * Dispatches trading signals across configured agent tiers with fallback routing
 * (Opus -> Sonnet -> Haiku) upon timeout or execution failure.
 */

import { logger } from '../shared/utils/logger';
import { SwarmLifecycleCoordinator } from './swarm-lifecycle';
import type {
  SwarmAgentTier,
  SwarmAction,
  SwarmProposal,
  SwarmConsensusResult,
  SwarmTelemetry,
  SwarmDispatchConfig,
  SwarmSignalInput,
  SwarmAgentHandler,
} from './types/swarm-types';

const DEFAULT_WEIGHTS: Record<SwarmAgentTier, number> = { opus: 0.5, sonnet: 0.35, haiku: 0.15 };
const DEFAULT_FALLBACK_CHAIN: SwarmAgentTier[] = ['opus', 'sonnet', 'haiku'];

export class SwarmDispatcher {
  private readonly lifecycle: SwarmLifecycleCoordinator;
  private readonly config: Required<SwarmDispatchConfig>;
  private readonly handler: SwarmAgentHandler;
  private latestTelemetry: SwarmTelemetry | null = null;

  constructor(config: SwarmDispatchConfig = {}, handler?: SwarmAgentHandler) {
    const sessionId = config.sessionId ?? `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.lifecycle = new SwarmLifecycleCoordinator(sessionId);
    this.config = {
      sessionId,
      primaryTier: config.primaryTier ?? 'opus',
      fallbackChain: config.fallbackChain ?? DEFAULT_FALLBACK_CHAIN,
      timeoutMs: config.timeoutMs ?? 2500,
      weights: { ...DEFAULT_WEIGHTS, ...config.weights },
      minConsensusConfidence: config.minConsensusConfidence ?? 0.6,
    };
    this.handler = handler ?? (async (tier, sig) => ({
      proposalId: `prop-${Date.now()}`,
      agentName: `agent-${tier}`,
      tier,
      symbol: sig.symbol,
      action: 'BUY',
      confidence: tier === 'opus' ? 0.88 : tier === 'sonnet' ? 0.78 : 0.65,
      price: sig.price,
      rationale: `Signal consensus from ${tier} engine`,
      timestamp: Date.now(),
    }));
  }

  public getLifecycle(): SwarmLifecycleCoordinator { return this.lifecycle; }
  public getTelemetry(): SwarmTelemetry | null { return this.latestTelemetry; }

  public async dispatch(signal: SwarmSignalInput): Promise<SwarmConsensusResult> {
    const start = Date.now();
    this.lifecycle.startAnalysis(this.config.timeoutMs);
    const proposals: SwarmProposal[] = [];
    const fallbacks: SwarmAgentTier[] = [];
    const chain = [this.config.primaryTier, ...this.config.fallbackChain.filter(t => t !== this.config.primaryTier)];
    let activeTier = this.config.primaryTier;

    for (let i = 0; i < chain.length; i++) {
      const currentTier = chain[i]!;
      activeTier = currentTier;
      if (i > 0) fallbacks.push(currentTier);
      try {
        proposals.push(await this.executeTierWithTimeout(currentTier, signal));
        break;
      } catch (err) {
        logger.warn('Agent tier failed, routing to fallback', {
          sessionId: this.config.sessionId,
          tier: currentTier,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (proposals.length === 0) {
      this.lifecycle.forceTimeout('All agent tiers in fallback chain exhausted');
      this.recordTelemetry(signal.symbol, activeTier, fallbacks, proposals, 'HOLD', 0, start);
      throw new Error(`Swarm dispatch failed: all tiers exhausted for ${signal.symbol}`);
    }

    const consensus = this.calculateConsensus(signal.symbol, proposals, activeTier);
    this.lifecycle.reachConsensus();
    this.recordTelemetry(signal.symbol, activeTier, fallbacks, proposals, consensus.finalAction, consensus.weightedConfidence, start);
    return consensus;
  }

  private async executeTierWithTimeout(tier: SwarmAgentTier, signal: SwarmSignalInput): Promise<SwarmProposal> {
    const ms = tier === 'opus' ? 1800 : tier === 'sonnet' ? 600 : 200;
    return new Promise<SwarmProposal>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error(`Tier ${tier} timed out after ${ms}ms`)); }
      }, ms);
      timer.unref();
      this.handler(tier, signal, ms).then((p) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(p); }
      }).catch((err) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(err); }
      });
    });
  }

  private calculateConsensus(symbol: string, proposals: SwarmProposal[], tier: SwarmAgentTier): SwarmConsensusResult {
    const scores: Record<SwarmAction, number> = { BUY: 0, SELL: 0, HOLD: 0 };
    let totalWeight = 0;
    for (const p of proposals) {
      const w = this.config.weights[p.tier] ?? 0.33;
      scores[p.action] += w * p.confidence;
      totalWeight += w;
    }

    let finalAction: SwarmAction = 'HOLD';
    let maxScore = -1;
    for (const act of ['BUY', 'SELL', 'HOLD'] as SwarmAction[]) {
      if (scores[act] > maxScore) { maxScore = scores[act]; finalAction = act; }
    }

    const confidence = totalWeight > 0 ? Math.min(1.0, maxScore / totalWeight) : 0;
    const agreeing = proposals.filter(p => p.action === finalAction).length;
    return {
      symbol,
      finalAction: confidence >= this.config.minConsensusConfidence ? finalAction : 'HOLD',
      weightedConfidence: confidence,
      agreementRatio: proposals.length > 0 ? agreeing / proposals.length : 0,
      proposals,
      decidingTier: tier,
      reachedAt: Date.now(),
    };
  }

  private recordTelemetry(
    symbol: string, tier: SwarmAgentTier, fallbacks: SwarmAgentTier[],
    proposals: SwarmProposal[], action: SwarmAction, conf: number, start: number,
  ): void {
    this.latestTelemetry = {
      sessionId: this.config.sessionId, symbol, dispatchedTier: tier,
      fallbackTiersUsed: fallbacks, proposalsCount: proposals.length,
      consensusScore: conf, finalDecision: action,
      executionLatencyMs: Date.now() - start, state: this.lifecycle.getState(),
      timedOut: this.lifecycle.getState() === 'TIMED_OUT', timestamp: Date.now(),
    };
  }
}
