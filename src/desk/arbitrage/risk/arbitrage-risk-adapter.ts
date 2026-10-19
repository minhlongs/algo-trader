/**
* Adapter helpers for mapping Pre-Trade Risk Check Params to Multi-Leg Arbitrage Basket.
*
* @module desk/arbitrage/risk/arbitrage-risk-adapter
*/

import type {
  MultiLegArbitrageBasket,
  ArbitrageRiskContext,
  ArbitrageRiskCheckParams,
} from './arbitrage-risk-types';

export function adaptPreTradeParamsToBasket(
  params: ArbitrageRiskCheckParams,
  context?: ArbitrageRiskContext,
): { basket: MultiLegArbitrageBasket; mergedContext: ArbitrageRiskContext } {
  const basket: MultiLegArbitrageBasket = {
    basketId: `basket-${Date.now()}`,
    legs: [
      {
        legId: 'leg-buy',
        venue: params.buyVenue,
        symbol: params.symbol,
        side: 'buy',
        amount: params.tradeNotionalUsd,
        price: 1.0,
        notionalUsd: params.tradeNotionalUsd,
      },
      {
        legId: 'leg-sell',
        venue: params.sellVenue,
        symbol: params.symbol,
        side: 'sell',
        amount: params.tradeNotionalUsd,
        price: 1.0,
        notionalUsd: params.tradeNotionalUsd,
      },
    ],
    totalNotionalUsd: params.tradeNotionalUsd,
    winProbability: params.winProbability,
    winLossRatio: params.winLossRatio,
  };

  const mergedContext: ArbitrageRiskContext = {
    ...context,
    venueLatencies: { ...params.venueLatencies, ...context?.venueLatencies },
    venueBalances: { ...params.venueBalances, ...context?.venueBalances },
    currentDrawdown: params.currentDrawdown ?? context?.currentDrawdown,
    portfolioValueUsd: params.bankrollUsd ?? context?.portfolioValueUsd,
    winProbability: params.winProbability ?? context?.winProbability,
    winLossRatio: params.winLossRatio ?? context?.winLossRatio,
  };

  return { basket, mergedContext };
}
