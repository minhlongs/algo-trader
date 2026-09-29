/**
 * Base Quoting Agent for MARL Market-Making.
 * Implements agent lifecycle, state tracking (inventory, PnL, fills), and base quoting template.
 */

import type { MarlAgentConfig, AgentObservation, QuoteProposal } from '../types/marl-types';
import type { MarlFillEvent } from '../types/marl-execution-types';
import { calculateOptimalQuotes, type OptimalQuotesResult } from '../models/avellaneda-stoikov';

export abstract class BaseQuotingAgent {
  protected inventory = 0;
  protected cashBalance = 0;
  protected realizedPnl = 0;
  protected costBasis = 0;
  protected quotesCount = 0;
  protected fillsCount = 0;

  constructor(public readonly config: MarlAgentConfig) {}

  public abstract computeQuote(observation: AgentObservation): QuoteProposal;

  public onFill(fill: MarlFillEvent): void {
    if (fill.agentId !== this.config.agentId) return;

    this.fillsCount++;
    const fillAmount = fill.amount;
    const fillPrice = fill.price;

    if (fill.side === 'buy') {
      const currentLong = Math.max(0, this.inventory);
      const newLong = currentLong + fillAmount;
      this.costBasis = newLong > 0
        ? (this.costBasis * currentLong + fillPrice * fillAmount) / newLong
        : fillPrice;
      this.inventory += fillAmount;
      this.cashBalance -= fillAmount * fillPrice + fill.fee;
      this.realizedPnl -= fill.fee;
    } else {
      this.inventory -= fillAmount;
      this.cashBalance += fillAmount * fillPrice - fill.fee;
      // Mark realized PnL change: net sell proceeds minus purchase cost basis
      this.realizedPnl += (fillAmount * fillPrice - fill.fee) - (this.costBasis * fillAmount);
      if (this.inventory <= 0) {
        this.costBasis = 0;
      }
    }
  }

  public reset(): void {
    this.inventory = 0;
    this.cashBalance = 0;
    this.realizedPnl = 0;
    this.costBasis = 0;
    this.quotesCount = 0;
    this.fillsCount = 0;
  }

  public getInventory(): number {
    return this.inventory;
  }

  public setInventory(inventory: number): void {
    this.inventory = inventory;
  }

  public getRealizedPnl(): number {
    return this.realizedPnl;
  }

  public getCostBasis(): number {
    return this.costBasis;
  }

  public setCostBasis(costBasis: number): void {
    this.costBasis = costBasis;
  }

  public getCashBalance(): number {
    return this.cashBalance;
  }

  public getStats(): {
    quotesCount: number;
    fillsCount: number;
    inventory: number;
    realizedPnl: number;
    cashBalance: number;
    costBasis: number;
  } {
    return {
      quotesCount: this.quotesCount,
      fillsCount: this.fillsCount,
      inventory: this.inventory,
      realizedPnl: this.realizedPnl,
      cashBalance: this.cashBalance,
      costBasis: this.costBasis,
    };
  }

  /**
   * Helper to compute standard Avellaneda-Stoikov quotes for this agent's config and inventory.
   */
  protected getBaseASQuotes(observation: AgentObservation): OptimalQuotesResult {
    return calculateOptimalQuotes({
      midPrice: observation.midPrice,
      inventory: this.inventory,
      gamma: this.config.gamma,
      kappa: this.config.kappa,
      sigma: observation.volatility > 0 ? observation.volatility : 0.02,
      timeToHorizon: Math.max(0.001, observation.timeToHorizonSec),
      tickSize: this.config.tickSize,
      minSpread: this.config.minSpread,
      maxSpread: this.config.maxSpread,
    });
  }
}
