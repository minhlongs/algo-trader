/**
 * Barra Multi-Factor Return Attribution Engine
 * Decomposes total asset returns into systematic style factor contributions and idiosyncratic residual return.
 *
 * @module desk/factor/barra-factor-attribution
 */

import { FactorAttributionResult, FactorExposureVector } from './factor-types';

export class BarraFactorAttribution {
  public attributeReturn(
    exposure: FactorExposureVector,
    factorReturns: Record<string, number>,
    totalAssetReturnPct: number
  ): FactorAttributionResult {
    const market = exposure.marketBeta * (factorReturns['market'] ?? 0);
    const size = exposure.sizeFactor * (factorReturns['size'] ?? 0);
    const value = exposure.valueFactor * (factorReturns['value'] ?? 0);
    const momentum = exposure.momentumFactor * (factorReturns['momentum'] ?? 0);
    const volatility = exposure.volatilityFactor * (factorReturns['volatility'] ?? 0);

    const factorExplained = market + size + value + momentum + volatility;
    const specificResidual = totalAssetReturnPct - factorExplained;

    return {
      asset: exposure.asset,
      totalReturnPct: Number(totalAssetReturnPct.toFixed(4)),
      factorExplainedReturnPct: Number(factorExplained.toFixed(4)),
      specificResidualReturnPct: Number(specificResidual.toFixed(4)),
      factorContributions: {
        market: Number(market.toFixed(4)),
        size: Number(size.toFixed(4)),
        value: Number(value.toFixed(4)),
        momentum: Number(momentum.toFixed(4)),
        volatility: Number(volatility.toFixed(4)),
      },
    };
  }
}
