export interface EtfConstituent {
  readonly symbol: string;
  readonly sharesPerCreationUnit: number;
  readonly lastPriceUsd: number;
}

export interface EtfBasket {
  readonly etfSymbol: string;
  readonly creationUnitSizeShares: number;
  readonly cashComponentUsd: number;
  readonly constituents: EtfConstituent[];
}

export interface InavResult {
  readonly etfSymbol: string;
  readonly inavPerShareUsd: number;
  readonly totalBasketValueUsd: number;
  readonly creationUnitSizeShares: number;
}

export interface EtfArbitrageSignal {
  readonly etfSymbol: string;
  readonly etfMarketPriceUsd: number;
  readonly inavPerShareUsd: number;
  readonly premiumDiscountBps: number;
  readonly transactionHurdleBps: number;
  readonly action: 'CREATE_AND_SELL_ETF' | 'REDEEM_AND_BUY_ETF' | 'NO_ARBITRAGE';
  readonly estimatedProfitPerUnitUsd: number;
}
