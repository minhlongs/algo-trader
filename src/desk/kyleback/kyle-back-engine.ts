import { KyleBackDynamics } from './kyle-back-dynamics';
import {
  KyleBackParams,
  KyleBackSimulationResult,
  KyleBackSnapshot,
} from './kyle-back-types';

export class KyleBackEngine {
  public simulateEquilibriumTrajectory(
    params: KyleBackParams,
    steps: number = 100
  ): KyleBackSimulationResult {
    if (steps < 2) {
      throw new Error('Steps must be at least 2');
    }

    const lambda = KyleBackDynamics.calculateTheoreticalLambda(params);
    const dt = params.timeHorizonYears / steps;
    const sqrtDt = Math.sqrt(dt);

    let price = params.priorMean;
    let cumulativeOrderFlow = 0.0;
    let informedPosition = 0.0;
    let totalInformedVolume = 0.0;
    let totalNoiseVolume = 0.0;

    const snapshots: KyleBackSnapshot[] = [
      {
        time: 0.0,
        price,
        cumulativeOrderFlow: 0.0,
        informedPosition: 0.0,
        informedTradingRate: 0.0,
        lambda,
        residualVariance: params.priorVariance,
      },
    ];

    let t = 0.0;

    for (let s = 1; s <= steps; s++) {
      t = s * dt;
      const tMid = t - 0.5 * dt;

      // Informed trader rate: alpha_t = beta(t) * (v - P_t)
      const beta = KyleBackDynamics.calculateTradingIntensity(params, tMid);
      const tradingRate = beta * (params.fundamentalValue - price);
      const dX = tradingRate * dt;

      // Noise trader uncoordinated order flow: dU = sigma_u * sqrt(dt) * Z
      const u1 = Math.max(1e-12, Math.random());
      const u2 = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const dU = params.noiseTraderSigma * sqrtDt * z;

      // Total order flow: dY = dX + dU
      const dY = dX + dU;

      // Market maker price updating rule: dP = lambda * dY
      const dP = lambda * dY;
      price += dP;

      cumulativeOrderFlow += dY;
      informedPosition += dX;
      totalInformedVolume += Math.abs(dX);
      totalNoiseVolume += Math.abs(dU);

      const residualVar = KyleBackDynamics.calculateResidualVariance(
        params.priorVariance,
        t,
        params.timeHorizonYears
      );

      snapshots.push({
        time: Number(t.toFixed(4)),
        price: Number(price.toFixed(4)),
        cumulativeOrderFlow: Number(cumulativeOrderFlow.toFixed(4)),
        informedPosition: Number(informedPosition.toFixed(4)),
        informedTradingRate: Number(tradingRate.toFixed(4)),
        lambda: Number(lambda.toFixed(6)),
        residualVariance: Number(residualVar.toFixed(4)),
      });
    }

    const terminalPriceError = Math.abs(price - params.fundamentalValue);
    const initialPriceError = Math.abs(params.priorMean - params.fundamentalValue);
    const priceDiscoveryEfficiencyPct =
      initialPriceError > 0
        ? Math.max(0, (1.0 - terminalPriceError / initialPriceError) * 100.0)
        : 100.0;

    return {
      snapshots,
      terminalPriceError: Number(terminalPriceError.toFixed(4)),
      priceDiscoveryEfficiencyPct: Number(
        priceDiscoveryEfficiencyPct.toFixed(2)
      ),
      totalInformedVolume: Number(totalInformedVolume.toFixed(4)),
      totalNoiseVolume: Number(totalNoiseVolume.toFixed(4)),
      theoreticalLambda: Number(lambda.toFixed(6)),
    };
  }
}
