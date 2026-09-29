/**
 * Multi-Agent Coordinator for MARL Market-Making.
 * Manages competitive quoting agents, aggregates optimal quotes, and routes fills.
 */

import type { BaseQuotingAgent } from './base-quoting-agent';
import type { AgentObservation, QuoteProposal } from '../types/marl-types';
import type { MarlFillEvent } from '../types/marl-execution-types';
import { quantizeToTick } from '../models/avellaneda-stoikov';
import { logger } from '../../../shared/utils/logger';

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
    if (mode === 'best_quote') return this.aggregateBestQuote(proposals, obs);
    if (mode === 'weighted_average') return this.aggregateWeightedAverage(proposals, obs);
    return this.aggregateConsensus(proposals);
  }

  private aggregateBestQuote(proposals: QuoteProposal[], obs: AgentObservation): QuoteProposal {
    const validBids = proposals.filter((p) => p.bidSize > 0 && p.bidPrice > 0);
    const validAsks = proposals.filter((p) => p.askSize > 0 && p.askPrice > 0);
    const bestBid = validBids.reduce((b, c) => (c.bidPrice > b.bidPrice ? c : b), validBids[0] ?? proposals[0]!);
    const bestAsk = validAsks.reduce((b, c) => (c.askPrice < b.askPrice ? c : b), validAsks[0] ?? proposals[0]!);

    this.lastBestBidAgentId = bestBid.agentId;
    this.lastBestAskAgentId = bestAsk.agentId;
    if (obs.symbol) {
      this.lastBestBidBySymbol.set(obs.symbol, bestBid.agentId);
      this.lastBestAskBySymbol.set(obs.symbol, bestAsk.agentId);
    }

    let bid = Math.max(0.01, Math.min(0.99, bestBid.bidPrice));
    let ask = Math.max(0.01, Math.min(0.99, bestAsk.askPrice));
    if (ask <= bid) {
      if (bid + 0.01 <= 0.99) ask = Number((bid + 0.01).toFixed(4));
      else bid = Number((ask - 0.01).toFixed(4));
    }

    return {
      agentId: `coordinator:best_quote`,
      symbol: obs.symbol,
      venue: obs.venue,
      bidPrice: bid,
      bidSize: bestBid.bidSize,
      askPrice: ask,
      askSize: bestAsk.askSize,
      reservationPrice: (bestBid.reservationPrice + bestAsk.reservationPrice) / 2,
      bidSpread: Number((obs.midPrice - bid).toFixed(4)),
      askSpread: Number((ask - obs.midPrice).toFixed(4)),
      confidence: (bestBid.confidence + bestAsk.confidence) / 2,
      metadata: { winningBidAgent: bestBid.agentId, winningAskAgent: bestAsk.agentId, mode: 'best_quote' },
      timestamp: obs.timestamp,
    };
  }

  private aggregateWeightedAverage(proposals: QuoteProposal[], obs: AgentObservation): QuoteProposal {
    let totalWeight = 0, sumBid = 0, sumAsk = 0, sumBidSize = 0, sumAskSize = 0, sumRes = 0;
    for (const p of proposals) {
      const agent = this.agents.get(p.agentId);
      const weight = (agent?.config.weight ?? 1.0) * Math.max(0.1, p.confidence);
      totalWeight += weight;
      sumBid += p.bidPrice * weight;
      sumAsk += p.askPrice * weight;
      sumBidSize += p.bidSize * weight;
      sumAskSize += p.askSize * weight;
      sumRes += p.reservationPrice * weight;
    }

    let bid = quantizeToTick(sumBid / totalWeight, 0.01);
    let ask = quantizeToTick(sumAsk / totalWeight, 0.01);
    bid = Math.max(0.01, Math.min(0.99, bid));
    ask = Math.max(0.01, Math.min(0.99, ask));
    if (ask <= bid) {
      if (bid + 0.01 <= 0.99) ask = Number((bid + 0.01).toFixed(4));
      else bid = Number((ask - 0.01).toFixed(4));
    }

    this.lastBestBidAgentId = null;
    this.lastBestAskAgentId = null;

    return {
      agentId: 'coordinator:weighted_average',
      symbol: obs.symbol,
      venue: obs.venue,
      bidPrice: bid,
      bidSize: Math.max(1, Math.round(sumBidSize / totalWeight)),
      askPrice: ask,
      askSize: Math.max(1, Math.round(sumAskSize / totalWeight)),
      reservationPrice: Number((sumRes / totalWeight).toFixed(4)),
      bidSpread: Number((obs.midPrice - bid).toFixed(4)),
      askSpread: Number((ask - obs.midPrice).toFixed(4)),
      confidence: Number((totalWeight / proposals.length).toFixed(4)),
      metadata: { mode: 'weighted_average', contributorCount: proposals.length },
      timestamp: obs.timestamp,
    };
  }

  private aggregateConsensus(proposals: QuoteProposal[]): QuoteProposal {
    const sorted = [...proposals].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0]!;
    this.lastBestBidAgentId = top.agentId;
    this.lastBestAskAgentId = top.agentId;
    return { ...top, agentId: `coordinator:consensus:${top.agentId}`, metadata: { ...top.metadata, mode: 'consensus' } };
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
