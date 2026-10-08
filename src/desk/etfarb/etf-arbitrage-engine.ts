import { EtfArbitrageSignal, InavResult } from './etfarb-types';

export class EtfArbitrageEngine {
  public evaluateArbitrage(
    inav: InavResult,
    etfMarketPriceUsd: number,
    transactionHurdleBps = 15.0
  ): EtfArbitrageSignal {
    const { etfSymbol, inavPerShareUsd, creationUnitSizeShares } = inav;

    if (inavPerShareUsd <= 0) {
      throw new Error('iNAV per share must be positive');
    }

    const premiumDiscount = (etfMarketPriceUsd - inavPerShareUsd) / inavPerShareUsd;
    const premiumDiscountBps = premiumDiscount * 10000.0;

    let action: 'CREATE_AND_SELL_ETF' | 'REDEEM_AND_BUY_ETF' | 'NO_ARBITRAGE' = 'NO_ARBITRAGE';
    let profitPerShareUsd = 0;

    const hurdleFraction = transactionHurdleBps / 10000.0;

    if (premiumDiscountBps > transactionHurdleBps) {
      // ETF trades at rich premium to basket NAV: Buy basket, create ETF, sell ETF in market
      action = 'CREATE_AND_SELL_ETF';
      profitPerShareUsd = (etfMarketPriceUsd - inavPerShareUsd) - (inavPerShareUsd * hurdleFraction);
    } else if (premiumDiscountBps < -transactionHurdleBps) {
      // ETF trades at steep discount to basket NAV: Buy ETF, redeem for basket, sell basket
      action = 'REDEEM_AND_BUY_ETF';
      profitPerShareUsd = (inavPerShareUsd - etfMarketPriceUsd) - (inavPerShareUsd * hurdleFraction);
    }

    const estimatedProfitPerUnitUsd = profitPerShareUsd * creationUnitSizeShares;

    return {
      etfSymbol,
      etfMarketPriceUsd,
      inavPerShareUsd,
      premiumDiscountBps: Number(premiumDiscountBps.toFixed(2)),
      transactionHurdleBps,
      action,
      estimatedProfitPerUnitUsd: Number(estimatedProfitPerUnitUsd.toFixed(2)),
    };
  }
}
