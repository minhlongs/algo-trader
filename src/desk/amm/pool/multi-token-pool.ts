/**
 * Multi-Outcome AMM Pool State Manager
 * Unified state container supporting LMSR and binary CPMM models,
 * virtual reserves, complete set minting/merging, and trade execution.
 */

import { logger } from '../../../shared/utils/logger';
import { CpmmPricing } from '../pricing/cpmm-pricing';
import { LmsrPricing } from '../pricing/lmsr-pricing';
import {
  AmmPricingModel,
  CompleteSetResult,
  OutcomeToken,
  PoolTradeRequest,
  PoolTradeResult,
} from '../types/amm-types';
import { CpmmReserves } from '../types/cpmm-types';
import { VirtualReserveTracker } from './virtual-reserve-tracker';

export interface MultiTokenPoolConfig {
  poolId: string;
  conditionId?: string;
  pricingModel?: AmmPricingModel;
  engineType?: AmmPricingModel;
  model?: AmmPricingModel;
  name?: string;
  outcomes: OutcomeToken[];
  b?: number;
  initialB?: number;
  lmsrB?: number;
  initialCpmmReserves?: { yes: number; no: number };
  initialCollateral?: number;
  initialCollateralUsdc?: number;
  feeBps?: number;
  collateralToken?: string;
}

export class MultiTokenPool {
  public readonly poolId: string;
  public readonly conditionId: string;
  public readonly pricingModel: AmmPricingModel;
  public readonly outcomes: OutcomeToken[];
  public readonly feeBps: number;

  private b: number;
  private cpmmReserves?: CpmmReserves;
  private tracker: VirtualReserveTracker;

  constructor(config: MultiTokenPoolConfig) {
    this.poolId = config.poolId;
    this.conditionId = config.conditionId ?? config.poolId;
    this.pricingModel = config.pricingModel ?? config.engineType ?? config.model ?? 'LMSR';
    this.outcomes = [...config.outcomes];
    this.feeBps = config.feeBps ?? 0;
    this.b = config.b ?? config.initialB ?? config.lmsrB ?? 1000;

    const n = this.outcomes.length;
    if (this.pricingModel === 'CPMM') {
      if (n !== 2) throw new Error('CPMM model requires exactly 2 outcomes (YES/NO)');
      const yes = config.initialCpmmReserves?.yes ?? 1000;
      const no = config.initialCpmmReserves?.no ?? 1000;
      this.cpmmReserves = { yesReserve: yes, noReserve: no, k: yes * no };
      this.tracker = new VirtualReserveTracker(2, config.initialCollateralUsdc ?? Math.max(yes, no), [yes, no]);
    } else {
      this.tracker = new VirtualReserveTracker(n, config.initialCollateralUsdc ?? this.b * Math.log(n));
    }
  }

  public getSpotPrices(): number[] {
    if (this.pricingModel === 'CPMM' && this.cpmmReserves) {
      const prices = CpmmPricing.calculateSpotPrices(this.cpmmReserves);
      return [prices.yesPrice, prices.noPrice];
    }
    return LmsrPricing.calculateSpotPrices(this.tracker.getVirtualReserves(), this.b);
  }

  public executeTrade(trade: PoolTradeRequest): PoolTradeResult {
    const spotBefore = this.getSpotPrices();
    const outcomeIdx = trade.outcomeIndex;
    if (outcomeIdx < 0 || outcomeIdx >= this.outcomes.length) {
      throw new Error(`Invalid outcome index: ${outcomeIdx}`);
    }

    let inputAmount = trade.amount;
    let outputAmount = 0;
    let feePaidUsdc = 0;

    if (this.pricingModel === 'CPMM' && this.cpmmReserves) {
      const outcome = outcomeIdx === 0 ? 'YES' : 'NO';
      if (trade.action === 'BUY') {
        const res = CpmmPricing.calculateBuy(outcome, inputAmount, this.cpmmReserves, this.feeBps);
        this.cpmmReserves = res.newReserves;
        this.tracker.setVirtualReserves([res.newReserves.yesReserve, res.newReserves.noReserve]);
        this.tracker.depositCollateral(res.netUsdcIn);
        outputAmount = res.sharesOut;
        feePaidUsdc = res.feePaidUsdc;
      } else if (trade.action === 'SELL') {
        const res = CpmmPricing.calculateSell(outcome, inputAmount, this.cpmmReserves, this.feeBps);
        this.cpmmReserves = res.newReserves;
        this.tracker.setVirtualReserves([res.newReserves.yesReserve, res.newReserves.noReserve]);
        this.tracker.withdrawCollateral(res.grossUsdcOut);
        outputAmount = res.netUsdcOut;
        feePaidUsdc = res.feePaidUsdc;
      } else {
        const res = CpmmPricing.calculateDirectSwap(outcome, inputAmount, this.cpmmReserves, this.feeBps);
        this.cpmmReserves = res.newReserves;
        this.tracker.setVirtualReserves([res.newReserves.yesReserve, res.newReserves.noReserve]);
        outputAmount = res.outputAmount;
      }
    } else {
      // LMSR model
      const liabilities = this.tracker.getVirtualReserves();
      const feeRate = this.feeBps / 10000;
      if (trade.action === 'BUY') {
        feePaidUsdc = inputAmount * feeRate;
        const netUsdc = inputAmount - feePaidUsdc;
        outputAmount = LmsrPricing.calculateSharesForBudget(liabilities, outcomeIdx, netUsdc, this.b);
        this.tracker.updateVirtualReserve(outcomeIdx, outputAmount);
        this.tracker.depositCollateral(netUsdc);
      } else if (trade.action === 'SELL') {
        const delta = new Array(this.outcomes.length).fill(0);
        delta[outcomeIdx] = -inputAmount;
        const grossCost = LmsrPricing.calculateTradeCost(liabilities, delta, this.b);
        const grossUsdc = Math.abs(grossCost);
        feePaidUsdc = grossUsdc * feeRate;
        outputAmount = grossUsdc - feePaidUsdc;
        this.tracker.updateVirtualReserve(outcomeIdx, -inputAmount);
        this.tracker.withdrawCollateral(grossUsdc);
      }
    }

    const spotAfter = this.getSpotPrices();
    const effectivePrice = trade.action === 'BUY'
      ? inputAmount / outputAmount
      : outputAmount / inputAmount;

    logger.debug('[MultiTokenPool] Executed trade', {
      poolId: this.poolId,
      action: trade.action,
      outcomeIndex: outcomeIdx,
      effectivePrice,
    });

    return {
      poolId: this.poolId,
      outcomeIndex: outcomeIdx,
      action: trade.action,
      inputAmount,
      outputAmount,
      feePaidUsdc,
      effectivePrice,
      spotPriceBefore: spotBefore[outcomeIdx],
      spotPriceAfter: spotAfter[outcomeIdx],
      timestampMs: Date.now(),
    };
  }

  public mintCompleteSets(setCount: number): CompleteSetResult {
    return this.tracker.mintCompleteSets(setCount, this.feeBps);
  }

  public mergeCompleteSets(setCount: number): CompleteSetResult {
    return this.tracker.mergeCompleteSets(setCount, this.feeBps);
  }

  public getB(): number { return this.b; }
  public setB(newB: number): void {
    if (newB <= 0) throw new Error('b must be positive');
    this.b = newB;
  }
  public getReserves(): number[] { return this.tracker.getVirtualReserves(); }
  public getCollateralReserve(): number { return this.tracker.getCollateralReserve(); }
  public getCpmmReserves(): CpmmReserves | undefined {
    return this.cpmmReserves ? { ...this.cpmmReserves } : undefined;
  }
}
