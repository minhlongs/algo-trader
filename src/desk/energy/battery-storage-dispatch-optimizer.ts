import {
  BatteryStorageParameters,
  StorageArbitrageSchedule,
} from './energy-types';

export class BatteryStorageDispatchOptimizer {
  /**
   * Identifies optimal single-cycle intra-day charge/discharge pair from hourly price profile
   * Accounts for round-trip efficiency (RTE) and cycling degradation costs.
   */
  public findOptimalArbitrage(
    hourlyPricesMWh: number[],
    params: BatteryStorageParameters
  ): StorageArbitrageSchedule {
    if (hourlyPricesMWh.length < 2) {
      throw new Error('At least 2 hourly prices required for arbitrage');
    }

    const eta = params.roundTripEfficiencyPct / 100.0;
    let bestProfit = -Infinity;
    let bestChargeHour = 0;
    let bestDischargeHour = 0;
    let bestEffectiveMargin = 0;

    for (let c = 0; c < hourlyPricesMWh.length; c++) {
      for (let d = c + 1; d < hourlyPricesMWh.length; d++) {
        const pCharge = hourlyPricesMWh[c]!;
        const pDischarge = hourlyPricesMWh[d]!;

        // Cost to store 1 MWh delivered: (pCharge / eta) + degradation
        const effectiveCostPerDeliveredMWh =
          pCharge / eta + params.cycleDegradationCostPerMWh;
        const marginPerMWh = pDischarge - effectiveCostPerDeliveredMWh;

        const maxMWhDischarged = Math.min(
          params.capacityMWh,
          params.maxDischargePowerMW
        );
        const totalProfit = marginPerMWh * maxMWhDischarged;

        if (totalProfit > bestProfit) {
          bestProfit = totalProfit;
          bestChargeHour = c;
          bestDischargeHour = d;
          bestEffectiveMargin = marginPerMWh;
        }
      }
    }

    const isViable = bestProfit > 0;

    return {
      chargeHour: bestChargeHour,
      dischargeHour: bestDischargeHour,
      chargePriceMWh: Number(hourlyPricesMWh[bestChargeHour]!.toFixed(2)),
      dischargePriceMWh: Number(hourlyPricesMWh[bestDischargeHour]!.toFixed(2)),
      netProfitUsd: Number(Math.max(0, bestProfit).toFixed(2)),
      effectiveRoundTripMarginUsdPerMWh: Number(bestEffectiveMargin.toFixed(2)),
      isViable,
    };
  }
}
