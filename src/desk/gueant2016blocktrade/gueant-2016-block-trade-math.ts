import type {
  Gueant2016BlockTradeInput,
  Gueant2016BlockTradeOutput,
} from './types';

export class Gueant2016BlockTrade {
  static evaluate(input: Gueant2016BlockTradeInput): Gueant2016BlockTradeOutput {
    const q = Math.abs(input.blockSizeSharesQ);
    const s0 = Math.max(0.01, input.referenceMidPriceS0);
    const permCostPerShare = 0.5 * input.permanentImpactGamma * q;
    const riskChargePerShare =
      q *
      Math.sqrt(
        0.5 *
          Math.max(0, input.riskAversionLambda) *
          input.dailyVolatilityDollarSigma *
          input.dailyVolatilityDollarSigma *
          Math.max(0, input.temporaryImpactEta)
      );
    const totalDiscount = permCostPerShare + riskChargePerShare;
    const guaranteedBlockBidPrice = Math.max(0.01, s0 - totalDiscount);
    const discountBps = (totalDiscount / s0) * 10000;

    const regime =
      discountBps >= 150
        ? 'EXTREME_ILLIQUIDITY_DISCOUNT'
        : discountBps >= 40
          ? 'ELEVATED_RISK_LIQUIDITY_CHARGE'
          : 'TIGHT_INSTITUTIONAL_BLOCK';

    return {
      permanentImpactCostPerShare: Number(permCostPerShare.toFixed(6)),
      executionRiskPremiumPerShare: Number(riskChargePerShare.toFixed(6)),
      totalBlockDiscountPerShare: Number(totalDiscount.toFixed(6)),
      guaranteedBlockBidPrice: Number(guaranteedBlockBidPrice.toFixed(4)),
      discountBasisPoints: Number(discountBps.toFixed(2)),
      regime,
    };
  }
}
