/**
 * Multi-Agent Coordinator Aggregator
 *
 * Helper methods for quote proposal aggregation (best quote, weighted average, consensus).
 *
 * @module desk/marl/agents/multi-agent-coordinator-aggregator
 */

import type { AgentObservation, QuoteProposal } from '../types/marl-types';
import type { BaseQuotingAgent } from './base-quoting-agent';
import { quantizeToTick } from '../models/avellaneda-stoikov';

export class MultiAgentCoordinatorAggregator {
  public static aggregateBestQuote(
    proposals: QuoteProposal[],
    obs: AgentObservation,
  ): {
    proposal: QuoteProposal;
    bestBidAgentId: string;
    bestAskAgentId: string;
  } {
    const validBids = proposals.filter((p) => p.bidSize > 0 && p.bidPrice > 0);
    const validAsks = proposals.filter((p) => p.askSize > 0 && p.askPrice > 0);
    const bestBid = validBids.reduce((b, c) => (c.bidPrice > b.bidPrice ? c : b), validBids[0] ?? proposals[0]!);
    const bestAsk = validAsks.reduce((b, c) => (c.askPrice < b.askPrice ? c : b), validAsks[0] ?? proposals[0]!);

    let bid = Math.max(0.01, Math.min(0.99, bestBid.bidPrice));
    let ask = Math.max(0.01, Math.min(0.99, bestAsk.askPrice));
    if (ask <= bid) {
      if (bid + 0.01 <= 0.99) ask = Number((bid + 0.01).toFixed(4));
      else bid = Number((ask - 0.01).toFixed(4));
    }

    const proposal: QuoteProposal = {
      agentId: 'coordinator:best_quote',
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

    return {
      proposal,
      bestBidAgentId: bestBid.agentId,
      bestAskAgentId: bestAsk.agentId,
    };
  }

  public static aggregateWeightedAverage(
    proposals: QuoteProposal[],
    obs: AgentObservation,
    agents: Map<string, BaseQuotingAgent>,
  ): QuoteProposal {
    let totalWeight = 0, sumBid = 0, sumAsk = 0, sumBidSize = 0, sumAskSize = 0, sumRes = 0;
    for (const p of proposals) {
      const agent = agents.get(p.agentId);
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

  public static aggregateConsensus(proposals: QuoteProposal[]): {
    proposal: QuoteProposal;
    winningAgentId: string;
  } {
    const sorted = [...proposals].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0]!;
    return {
      proposal: {
        ...top,
        agentId: `coordinator:consensus:${top.agentId}`,
        metadata: { ...top.metadata, mode: 'consensus' },
      },
      winningAgentId: top.agentId,
    };
  }
}
