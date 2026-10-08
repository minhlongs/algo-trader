/**
 * Power & Energy Desk Types
 *
 * @module desk/energy/energy-types
 */

export interface FuelSpecification {
  readonly fuelType: 'NATURAL_GAS' | 'COAL';
  readonly pricePerUnit: number; // Gas in $/MMBtu, Coal in $/short ton
  readonly heatRateMWh: number; // MMBtu/MWh or tons/MWh required
  readonly carbonIntensityTonsPerMWh: number; // tCO2/MWh
}

export interface GenerationMarketData {
  readonly electricityPriceMWh: number; // $/MWh
  readonly carbonAllowancePriceTon: number; // $/tCO2 EUA / CCA
  readonly variableOAndMCostMWh: number; // $/MWh
}

export interface SpreadEvaluation {
  readonly grossSpreadUsdPerMWh: number;
  readonly netCleanSpreadUsdPerMWh: number;
  readonly fuelCostUsdPerMWh: number;
  readonly carbonCostUsdPerMWh: number;
  readonly isEconomicToDispatch: boolean;
  readonly dispatchMarginPct: number;
}

export interface BatteryStorageParameters {
  readonly capacityMWh: number;
  readonly maxChargePowerMW: number;
  readonly maxDischargePowerMW: number;
  readonly roundTripEfficiencyPct: number; // e.g. 85.0%
  readonly cycleDegradationCostPerMWh: number; // $/MWh
}

export interface StorageArbitrageSchedule {
  readonly chargeHour: number;
  readonly dischargeHour: number;
  readonly chargePriceMWh: number;
  readonly dischargePriceMWh: number;
  readonly netProfitUsd: number;
  readonly effectiveRoundTripMarginUsdPerMWh: number;
  readonly isViable: boolean;
}
