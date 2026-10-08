import {
  FuelSpecification,
  GenerationMarketData,
  SpreadEvaluation,
} from './energy-types';

export class SparkDarkSpreadEngine {
  /**
   * Evaluates clean spark spread (gas) or clean dark spread (coal)
   * CSS / CDS = ElectricityPrice - (HeatRate * FuelPrice) - (CarbonIntensity * CarbonPrice) - VariableOM
   */
  public evaluateSpread(
    fuel: FuelSpecification,
    market: GenerationMarketData
  ): SpreadEvaluation {
    const fuelCost = fuel.heatRateMWh * fuel.pricePerUnit;
    const carbonCost =
      fuel.carbonIntensityTonsPerMWh * market.carbonAllowancePriceTon;
    const totalGenerationCost =
      fuelCost + carbonCost + market.variableOAndMCostMWh;

    const grossSpread = market.electricityPriceMWh - fuelCost;
    const netCleanSpread = market.electricityPriceMWh - totalGenerationCost;

    const isEconomic = netCleanSpread > 0;
    const dispatchMarginPct =
      market.electricityPriceMWh > 0
        ? (netCleanSpread / market.electricityPriceMWh) * 100.0
        : 0;

    return {
      grossSpreadUsdPerMWh: Number(grossSpread.toFixed(4)),
      netCleanSpreadUsdPerMWh: Number(netCleanSpread.toFixed(4)),
      fuelCostUsdPerMWh: Number(fuelCost.toFixed(4)),
      carbonCostUsdPerMWh: Number(carbonCost.toFixed(4)),
      isEconomicToDispatch: isEconomic,
      dispatchMarginPct: Number(dispatchMarginPct.toFixed(2)),
    };
  }

  /**
   * Computes plant break-even electricity price required for dispatch
   */
  public calculateBreakEvenPowerPrice(
    fuel: FuelSpecification,
    carbonPriceTon: number,
    vomCostMWh = 0
  ): number {
    const fuelCost = fuel.heatRateMWh * fuel.pricePerUnit;
    const carbonCost = fuel.carbonIntensityTonsPerMWh * carbonPriceTon;
    return Number((fuelCost + carbonCost + vomCostMWh).toFixed(4));
  }
}
