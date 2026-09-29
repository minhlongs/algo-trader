/**
 * Virtual Reserve Tracker & Complete-Set Accounting
 * Manages virtual liquidity reserves, outcome token balances,
 * and 1.00 USDC <=> 1 of each outcome token complete-set invariant.
 */

import { logger } from '../../../shared/utils/logger';
import { CompleteSetResult } from '../types/amm-types';

export class VirtualReserveTracker {
  private readonly numOutcomes: number;
  private collateralReserveUsdc: number;
  private virtualReserves: number[];
  private outcomeBalances: number[];

  constructor(numOutcomes: number, initialCollateral: number = 0, initialVirtualReserves?: number[]) {
    if (numOutcomes < 2) {
      throw new Error(`Market must have at least 2 outcomes, got ${numOutcomes}`);
    }
    this.numOutcomes = numOutcomes;
    this.collateralReserveUsdc = Math.max(0, initialCollateral);
    this.virtualReserves = initialVirtualReserves && initialVirtualReserves.length === numOutcomes
      ? [...initialVirtualReserves]
      : new Array(numOutcomes).fill(0);
    this.outcomeBalances = new Array(numOutcomes).fill(0);
  }

  /**
   * Mint complete sets: 1.00 USDC -> 1 share of every outcome token
   */
  public mintCompleteSets(setCount: number, feeBps: number = 0): CompleteSetResult {
    if (setCount <= 0) throw new Error('setCount must be positive');
    const feeRate = feeBps / 10000;
    const feeUsdc = setCount * feeRate;
    const netCollateral = setCount - feeUsdc;

    this.collateralReserveUsdc += netCollateral;
    for (let i = 0; i < this.numOutcomes; i++) {
      this.outcomeBalances[i] += setCount;
    }

    logger.debug('[VirtualReserveTracker] Minted complete sets', {
      setCount,
      netCollateral,
      feeUsdc,
      totalCollateral: this.collateralReserveUsdc,
    });

    return {
      operation: 'MINT',
      setCount,
      collateralUsdc: netCollateral,
      feeUsdc,
      timestampMs: Date.now(),
    };
  }

  /**
   * Merge complete sets: 1 share of every outcome token -> 1.00 USDC
   */
  public mergeCompleteSets(setCount: number, feeBps: number = 0): CompleteSetResult {
    if (setCount <= 0) throw new Error('setCount must be positive');
    for (let i = 0; i < this.numOutcomes; i++) {
      if (this.outcomeBalances[i] < setCount) {
        throw new Error(
          `Insufficient balance for outcome ${i}: have ${this.outcomeBalances[i]}, need ${setCount}`
        );
      }
    }

    const feeRate = feeBps / 10000;
    const feeUsdc = setCount * feeRate;
    const netCollateral = setCount - feeUsdc;
    if (this.collateralReserveUsdc < netCollateral) {
      throw new Error(
        `Insufficient collateral reserve in vault: have ${this.collateralReserveUsdc}, need ${netCollateral}`
      );
    }

    for (let i = 0; i < this.numOutcomes; i++) {
      this.outcomeBalances[i] -= setCount;
    }
    this.collateralReserveUsdc -= netCollateral;

    logger.debug('[VirtualReserveTracker] Merged complete sets', {
      setCount,
      netCollateral,
      feeUsdc,
      remainingCollateral: this.collateralReserveUsdc,
    });

    return {
      operation: 'MERGE',
      setCount,
      collateralUsdc: netCollateral,
      feeUsdc,
      timestampMs: Date.now(),
    };
  }

  public updateVirtualReserve(outcomeIndex: number, delta: number): void {
    if (outcomeIndex < 0 || outcomeIndex >= this.numOutcomes) {
      throw new Error(`Invalid outcomeIndex: ${outcomeIndex}`);
    }
    this.virtualReserves[outcomeIndex] += delta;
  }

  public setVirtualReserves(newReserves: number[]): void {
    if (newReserves.length !== this.numOutcomes) {
      throw new Error('Reserves length mismatch');
    }
    this.virtualReserves = [...newReserves];
  }

  public getVirtualReserves(): number[] {
    return [...this.virtualReserves];
  }

  public getOutcomeBalances(): number[] {
    return [...this.outcomeBalances];
  }

  public getCollateralReserve(): number {
    return this.collateralReserveUsdc;
  }

  public depositCollateral(amountUsdc: number): void {
    if (amountUsdc <= 0) throw new Error('Deposit must be positive');
    this.collateralReserveUsdc += amountUsdc;
  }

  public withdrawCollateral(amountUsdc: number): void {
    if (amountUsdc <= 0 || amountUsdc > this.collateralReserveUsdc) {
      throw new Error('Invalid withdrawal amount');
    }
    this.collateralReserveUsdc -= amountUsdc;
  }
}
