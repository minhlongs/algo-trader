import { EtfBasket, InavResult } from './etfarb-types';

export class InavBasketCalculator {
  public computeInav(basket: EtfBasket): InavResult {
    const { etfSymbol, creationUnitSizeShares, cashComponentUsd, constituents } = basket;

    if (creationUnitSizeShares <= 0) {
      throw new Error('creationUnitSizeShares must be positive');
    }

    let equityValueUsd = 0;
    for (const c of constituents) {
      equityValueUsd += c.sharesPerCreationUnit * c.lastPriceUsd;
    }

    const totalBasketValueUsd = equityValueUsd + cashComponentUsd;
    const inavPerShareUsd = totalBasketValueUsd / creationUnitSizeShares;

    return {
      etfSymbol,
      inavPerShareUsd: Number(inavPerShareUsd.toFixed(4)),
      totalBasketValueUsd: Number(totalBasketValueUsd.toFixed(2)),
      creationUnitSizeShares,
    };
  }
}
