/**
 * Engle-Russell (1998) ACD Forecasting & Trade Intensity Engine
 *
 * Master orchestrator for fitting high-frequency transaction arrival models,
 * forecasting trading speed, and classifying market regimes into rapid/normal/dormant.
 *
 * @module desk/englerussell/engle-russell-engine
 */

import type {
  AcdFitResult,
  AcdForecastResult,
  AcdModelConfig,
  TradeDurationEvent,
} from './engle-russell-types';
import {
  computeConditionalDurations,
  estimateAcd11,
} from './engle-russell-estimator';

export class EngleRussellAcdEngine {
  private fitResult?: AcdFitResult;
  private lastPsi?: number;
  private lastDuration?: number;

  constructor(private readonly config: AcdModelConfig) {}

  /** Fit ACD model on a historical series of durations */
  fit(durations: number[]): AcdFitResult {
    this.fitResult = estimateAcd11(durations, this.config);
    const psiSeries = computeConditionalDurations(
      durations,
      this.fitResult.omega,
      this.fitResult.alpha[0],
      this.fitResult.beta[0],
    );
    this.lastPsi = psiSeries[psiSeries.length - 1];
    this.lastDuration = durations[durations.length - 1];
    return this.fitResult;
  }

  /** Fit from raw transaction trade events */
  fitFromEvents(events: TradeDurationEvent[]): AcdFitResult {
    const durations = events.map((e) => e.duration).filter((d) => d > 0);
    return this.fit(durations);
  }

  /** Get current fitted model parameters */
  getModel(): AcdFitResult {
    if (!this.fitResult) {
      throw new Error('ACD model must be fitted first via fit()');
    }
    return this.fitResult;
  }

  /**
   * Forecast future conditional durations psi_{t+h} and implied trade arrival intensity lambda = 1 / psi
   * Recursion: E[psi_{t+h}] = omega + (alpha + beta) * E[psi_{t+h-1}]
   */
  forecast(horizonSteps = 5): AcdForecastResult {
    const model = this.getModel();
    const alpha = model.alpha[0];
    const beta = model.beta[0];
    const omega = model.omega;
    const persistence = model.persistence;

    let currentPsi = this.lastPsi ?? model.unconditionalMeanDuration;
    const lastX = this.lastDuration ?? currentPsi;

    // Step 1 ahead: psi_{t+1} = omega + alpha * x_t + beta * psi_t
    const psi1 = omega + alpha * lastX + beta * currentPsi;

    const forecastDurations: number[] = [psi1];
    const arrivalIntensity: number[] = [1 / Math.max(1e-4, psi1)];

    let prevForecast = psi1;
    for (let h = 2; h <= horizonSteps; h++) {
      // Step h ahead: psi_{t+h} = omega + (alpha + beta) * psi_{t+h-1}
      const psiH = omega + persistence * prevForecast;
      forecastDurations.push(psiH);
      arrivalIntensity.push(1 / Math.max(1e-4, psiH));
      prevForecast = psiH;
    }

    // Classify trading speed regime relative to unconditional mean duration
    const unconditional = model.unconditionalMeanDuration;
    const avgForecast = forecastDurations.reduce((s, x) => s + x, 0) / forecastDurations.length;

    let speedRegime: 'rapid' | 'normal' | 'dormant' = 'normal';
    if (avgForecast < 0.6 * unconditional) {
      speedRegime = 'rapid';
    } else if (avgForecast > 1.6 * unconditional) {
      speedRegime = 'dormant';
    }

    return {
      horizonSteps,
      forecastDurations,
      arrivalIntensity,
      speedRegime,
    };
  }

  /** Update with a newly observed duration online */
  updateOnline(duration: number): number {
    const model = this.getModel();
    const alpha = model.alpha[0];
    const beta = model.beta[0];
    const omega = model.omega;

    const prevPsi = this.lastPsi ?? model.unconditionalMeanDuration;
    const newPsi = omega + alpha * duration + beta * prevPsi;

    this.lastPsi = newPsi;
    this.lastDuration = duration;
    return newPsi;
  }
}
