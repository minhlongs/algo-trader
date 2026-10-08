/**
 * Total Return Swap (TRS) Synthetic Financing Engine
 * Prices and settles synthetic equity/crypto contracts, calculating equity appreciation and financing legs.
 *
 * @module desk/prime/total-return-swap-pricer
 */

import { TrsContract, TrsSettlementFlow } from './prime-types';

export class TotalReturnSwapPricer {
  private readonly contracts = new Map<string, TrsContract>();

  public createContract(contract: TrsContract): void {
    this.contracts.set(contract.contractId, { ...contract });
  }

  public getContract(contractId: string): TrsContract | undefined {
    return this.contracts.get(contractId);
  }

  /**
   * Calculates cash flow settlement at reset date and updates contract state.
   */
  public settlePeriodicReset(
    contractId: string,
    currentPrice: number,
    benchmarkRateBps: number,
    settlementTimestampMs: number
  ): TrsSettlementFlow {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`TRS contract not found: ${contractId}`);
    }

    const elapsedDays = Math.max(
      0.001,
      (settlementTimestampMs - contract.lastResetTimestampMs) / (1000 * 60 * 60 * 24)
    );

    // Equity Leg PnL = Quantity * (CurrentPrice - LastResetPrice)
    const equityLegPnl = Number(
      (contract.notionalQuantity * (currentPrice - contract.lastResetPrice)).toFixed(2)
    );

    // Financing Leg = Initial Notional Value * Annual Rate * (Days / 360)
    const totalFinancingRate = (benchmarkRateBps + contract.financingSpreadBps) / 10000;
    const notionalBase = contract.notionalQuantity * contract.lastResetPrice;
    const financingLegDue = Number(
      (notionalBase * totalFinancingRate * (elapsedDays / 360)).toFixed(2)
    );

    const netSettlementDue = Number((equityLegPnl - financingLegDue).toFixed(2));
    const counterpartyPaymentDirection = netSettlementDue >= 0 ? 'RECEIVE' : 'PAY';

    // Update contract reset state
    contract.lastResetPrice = currentPrice;
    contract.lastResetTimestampMs = settlementTimestampMs;

    return {
      contractId,
      timestampMs: settlementTimestampMs,
      equityLegPnl,
      financingLegDue,
      netSettlementDue,
      counterpartyPaymentDirection,
    };
  }

  /**
   * Computes real-time Mark-to-Market (MtM) unaccrued valuation without resetting the contract.
   */
  public calculateMarkToMarket(
    contractId: string,
    currentPrice: number,
    benchmarkRateBps: number,
    currentTimestampMs: number
  ): {
    unrealizedEquityPnl: number;
    accruedFinancingCost: number;
    netMtMValue: number;
  } {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`TRS contract not found: ${contractId}`);
    }

    const elapsedDays = Math.max(
      0,
      (currentTimestampMs - contract.lastResetTimestampMs) / (1000 * 60 * 60 * 24)
    );

    const unrealizedEquityPnl = Number(
      (contract.notionalQuantity * (currentPrice - contract.lastResetPrice)).toFixed(2)
    );

    const totalFinancingRate = (benchmarkRateBps + contract.financingSpreadBps) / 10000;
    const notionalBase = contract.notionalQuantity * contract.lastResetPrice;
    const accruedFinancingCost = Number(
      (notionalBase * totalFinancingRate * (elapsedDays / 360)).toFixed(2)
    );

    const netMtMValue = Number((unrealizedEquityPnl - accruedFinancingCost).toFixed(2));

    return {
      unrealizedEquityPnl,
      accruedFinancingCost,
      netMtMValue,
    };
  }
}
