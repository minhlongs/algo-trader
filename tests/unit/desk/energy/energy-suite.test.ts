import { describe, it, expect } from 'vitest';
import { SparkDarkSpreadEngine } from '../../../../src/desk/energy/spark-dark-spread-engine';
import { BatteryStorageDispatchOptimizer } from '../../../../src/desk/energy/battery-storage-dispatch-optimizer';
import {
  FuelSpecification,
  GenerationMarketData,
  BatteryStorageParameters,
} from '../../../../src/desk/energy/energy-types';

describe('Power & Energy Desk Suite', () => {
  describe('SparkDarkSpreadEngine', () => {
    it('evaluates clean spark spread for natural gas generation', () => {
      const engine = new SparkDarkSpreadEngine();

      const gasFuel: FuelSpecification = {
        fuelType: 'NATURAL_GAS',
        pricePerUnit: 3.5, // $3.50/MMBtu
        heatRateMWh: 7.2, // 7.2 MMBtu/MWh
        carbonIntensityTonsPerMWh: 0.38, // 0.38 tCO2/MWh
      };

      const market: GenerationMarketData = {
        electricityPriceMWh: 65.0, // $65/MWh
        carbonAllowancePriceTon: 30.0, // $30/tCO2
        variableOAndMCostMWh: 3.0, // $3/MWh
      };

      const res = engine.evaluateSpread(gasFuel, market);

      // Fuel cost = 7.2 * 3.5 = 25.2
      // Carbon cost = 0.38 * 30.0 = 11.4
      // Total cost = 25.2 + 11.4 + 3.0 = 39.6
      // Net Clean Spark = 65.0 - 39.6 = 25.4
      expect(res.fuelCostUsdPerMWh).toBe(25.2);
      expect(res.carbonCostUsdPerMWh).toBe(11.4);
      expect(res.netCleanSpreadUsdPerMWh).toBe(25.4);
      expect(res.isEconomicToDispatch).toBe(true);
      expect(res.dispatchMarginPct).toBeGreaterThan(30.0);
    });

    it('computes break-even power price correctly', () => {
      const engine = new SparkDarkSpreadEngine();
      const gasFuel: FuelSpecification = {
        fuelType: 'NATURAL_GAS',
        pricePerUnit: 4.0,
        heatRateMWh: 7.0,
        carbonIntensityTonsPerMWh: 0.4,
      };

      const bePrice = engine.calculateBreakEvenPowerPrice(gasFuel, 25.0, 2.0);
      // 28.0 + 10.0 + 2.0 = 40.0
      expect(bePrice).toBe(40.0);
    });
  });

  describe('BatteryStorageDispatchOptimizer', () => {
    it('finds optimal intra-day charge and discharge arbitrage schedule', () => {
      const optimizer = new BatteryStorageDispatchOptimizer();

      const hourlyPrices = [
        25.0, 20.0, 18.0, 22.0, 45.0, 75.0, 95.0, 60.0, // Hours 0 to 7
      ];

      const params: BatteryStorageParameters = {
        capacityMWh: 100,
        maxChargePowerMW: 50,
        maxDischargePowerMW: 50,
        roundTripEfficiencyPct: 85.0, // 85%
        cycleDegradationCostPerMWh: 5.0,
      };

      const schedule = optimizer.findOptimalArbitrage(hourlyPrices, params);

      expect(schedule.isViable).toBe(true);
      expect(schedule.chargeHour).toBe(2); // Lowest price = $18.0
      expect(schedule.dischargeHour).toBe(6); // Peak price = $95.0
      expect(schedule.netProfitUsd).toBeGreaterThan(0);
    });
  });
});
