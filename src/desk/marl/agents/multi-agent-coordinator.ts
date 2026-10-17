/**
 * Multi-Agent Coordinator for MARL Market-Making.
 * Manages competitive quoting agents, aggregates optimal quotes, and routes fills.
 */

import type { BaseQuotingAgent } from './base-quoting-agent';
import type { AgentObservation, QuoteProposal } from '../types/marl-types';
import type { MarlFillEvent } from '../types/marl-execution-types';
import { logger } from '../../../shared/utils/logger';
import { MultiAgentCoordinatorAggregator } from './multi-agent-coordinator-aggregator';

export type AggregationMode = 'best_quote' | 'weighted_average' | 'consensus';

export class MultiAgentCoordinator {
  private readonly agents = new Map<string, BaseQuotingAgent>();
  public lastBestBidAgentId: string | null = null;
  public lastBestAskAgentId: string | null = null;
  private readonly lastBestBidBySymbol = new Map<string, string>();
  private readonly lastBestAskBySymbol = new Map<string, string>();

  constructor(agents: BaseQuotingAgent[] = []) {
    for (const a of agents) this.registerAgent(a);
  }

  public registerAgent(agent: BaseQuotingAgent): void { this.agents.set(agent.config.agentId, agent); }
  public unregisterAgent(agentId: string): boolean { return this.agents.delete(agentId); }
  public getAgent(agentId: string): BaseQuotingAgent | undefined { return this.agents.get(agentId); }
  public getAllAgents(): BaseQuotingAgent[] { return Array.from(this.agents.values()); }
  public getLastBestBidAgentId(): string | null { return this.lastBestBidAgentId; }
  public getLastBestAskAgentId(): string | null { return this.lastBestAskAgentId; }

  public generateProposals(observation: AgentObservation): QuoteProposal[] {
    const proposals: QuoteProposal[] = [];
    for (const agent of this.agents.values()) {
      if (!agent.config.enabled) continue;
      try {
        proposals.push(agent.computeQuote(observation));
      } catch (err) {
        logger.error('[MultiAgentCoordinator] Agent quote failed', {
          agentId: agent.config.agentId,
          error: (err as Error).message,
        });
      }
    }
    return proposals;
  }

  public coordinate(obs: AgentObservation, mode: AggregationMode = 'best_quote'): QuoteProposal | null {
    const proposals = this.generateProposals(obs);
    return proposals.length === 0 ? null : this.aggregateQuotes(proposals, mode, obs);
  }

  public aggregateQuotes(proposals: QuoteProposal[], mode: AggregationMode, obs: AgentObservation): QuoteProposal {
    if (proposals.length === 1) return proposals[0]!;
    if (mode === 'best_quote') {
      const res = MultiAgentCoordinatorAggregator.aggregateBestQuote(proposals, obs);
      this.lastBestBidAgentId = res.bestBidAgentId;
      this.lastBestAskAgentId = res.bestAskAgentId;
      if (obs.symbol) {
        this.lastBestBidBySymbol.set(obs.symbol, res.bestBidAgentId);
        this.lastBestAskBySymbol.set(obs.symbol, res.bestAskAgentId);
      }
      return res.proposal;
    }
    if (mode === 'weighted_average') {
      this.lastBestBidAgentId = null;
      this.lastBestAskAgentId = null;
      return MultiAgentCoordinatorAggregator.aggregateWeightedAverage(proposals, obs, this.agents);
    }
    const res = MultiAgentCoordinatorAggregator.aggregateConsensus(proposals);
    this.lastBestBidAgentId = res.winningAgentId;
    this.lastBestAskAgentId = res.winningAgentId;
    return res.proposal;
  }

  public dispatchFill(fill: MarlFillEvent): void {
    const directAgent = this.agents.get(fill.agentId);
    if (directAgent) {
      directAgent.onFill(fill);
      return;
    }

    const winningAgentId = fill.side === 'buy'
      ? (this.lastBestBidBySymbol.get(fill.symbol) ?? this.lastBestBidAgentId)
      : (this.lastBestAskBySymbol.get(fill.symbol) ?? this.lastBestAskAgentId);

    const winningAgent = winningAgentId ? this.agents.get(winningAgentId) : undefined;
    if (winningAgent) {
      winningAgent.onFill({ ...fill, agentId: winningAgent.config.agentId });
      return;
    }

    this.dispatchProportionalFill(fill);
  }

  private dispatchProportionalFill(fill: MarlFillEvent): void {
    const active = Array.from(this.agents.values()).filter((a) => a.config.enabled);
    const targets = active.length > 0 ? active : Array.from(this.agents.values());
    if (targets.length === 0) return;

    const totalWeight = targets.reduce((sum, a) => sum + Math.max(0.001, a.config.weight ?? 1.0), 0);
    let remAmount = fill.amount;
    let remFee = fill.fee;

    for (let i = 0; i < targets.length; i++) {
      const agent = targets[i]!;
      const isLast = i === targets.length - 1;
      const ratio = Math.max(0.001, agent.config.weight ?? 1.0) / totalWeight;
      const amount = isLast ? remAmount : Number((fill.amount * ratio).toFixed(4));
      const fee = isLast ? remFee : Number((fill.fee * ratio).toFixed(4));
      remAmount = Math.max(0, Number((remAmount - amount).toFixed(4)));
      remFee = Math.max(0, Number((remFee - fee).toFixed(4)));
      if (amount > 0) agent.onFill({ ...fill, agentId: agent.config.agentId, amount, fee });
    }
  }

  public reset(): void {
    this.lastBestBidAgentId = null;
    this.lastBestAskAgentId = null;
    this.lastBestBidBySymbol.clear();
    this.lastBestAskBySymbol.clear();
    for (const agent of this.agents.values()) agent.reset();
  }
}
