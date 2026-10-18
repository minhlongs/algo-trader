// SPDX-License-Identifier: MIT
/**
 * Wave 341 — Huang & Stoll (1997) The Components of the Bid-Ask Spread: A General Approach
 * Decomposes the traded spread S into three structural fractions:
 * Adverse Selection (α), Inventory Holding Cost (β), and Order Processing Cost (1 - α - β).
 */

export interface HuangStoll1997Input {
  readonly tradedSpreadBps: number;
  readonly adverseSelectionAlpha: number;
  readonly inventoryHoldingBeta: number;
  readonly tradeDirectionCorrelationPi?: number;
}

export interface HuangStoll1997Output {
  readonly tradedSpreadBps: number;
  readonly adverseSelectionShare: number;
  readonly inventoryHoldingShare: number;
  readonly orderProcessingShare: number;
  readonly adverseSelectionBps: number;
  readonly inventoryHoldingBps: number;
  readonly orderProcessingBps: number;
  readonly permanentPriceImpactHalfSpreadBps: number;
}

export class HuangStoll1997Engine {
  public decomposeSpread(input: HuangStoll1997Input): HuangStoll1997Output {
    const spread = Math.max(0, input.tradedSpreadBps);
    const alpha = Math.min(0.95, Math.max(0, input.adverseSelectionAlpha));
    const beta = Math.min(1 - alpha, Math.max(0, input.inventoryHoldingBeta));
    const orderProcessingShare = Math.max(0, 1 - alpha - beta);

    const adverseSelectionBps = spread * alpha;
    const inventoryHoldingBps = spread * beta;
    const orderProcessingBps = spread * orderProcessingShare;
    const permanentPriceImpactHalfSpreadBps = 0.5 * adverseSelectionBps;

    return {
      tradedSpreadBps: Number(spread.toFixed(4)),
      adverseSelectionShare: Number(alpha.toFixed(4)),
      inventoryHoldingShare: Number(beta.toFixed(4)),
      orderProcessingShare: Number(orderProcessingShare.toFixed(4)),
      adverseSelectionBps: Number(adverseSelectionBps.toFixed(4)),
      inventoryHoldingBps: Number(inventoryHoldingBps.toFixed(4)),
      orderProcessingBps: Number(orderProcessingBps.toFixed(4)),
      permanentPriceImpactHalfSpreadBps: Number(permanentPriceImpactHalfSpreadBps.toFixed(4)),
    };
  }
}
