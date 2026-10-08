/**
 * Online Kalman Filter Alpha Synthesis Engine
 * Adaptively combines heterogeneous alpha signals with dynamic Bayesian state-space estimation.
 *
 * @module desk/alphadynamics/kalman-alpha-combiner
 */

import {
  AlphaObservation,
  KalmanAlphaState,
} from './alphadynamics-types';

export class KalmanAlphaCombiner {
  private weights: number[];
  private P: number[][]; // Covariance matrix
  private readonly Q: number[][]; // Process noise covariance
  private readonly R: number; // Measurement noise variance

  constructor(
    private readonly numSignals: number,
    processNoise = 1e-4,
    measurementNoise = 1e-2
  ) {
    if (numSignals <= 0) {
      throw new Error('numSignals must be strictly positive');
    }

    // Initialize equal weights
    this.weights = new Array(numSignals).fill(1.0 / numSignals);

    // Initialize state covariance P as identity
    this.P = Array.from({ length: numSignals }, (_, i) =>
      Array.from({ length: numSignals }, (_, j) => (i === j ? 1.0 : 0.0))
    );

    // Process noise matrix Q
    this.Q = Array.from({ length: numSignals }, (_, i) =>
      Array.from({ length: numSignals }, (_, j) => (i === j ? processNoise : 0.0))
    );

    this.R = measurementNoise;
  }

  /**
   * Updates state weights via Kalman observation update.
   */
  public update(obs: AlphaObservation): KalmanAlphaState {
    const H = obs.alphaSignalValues;
    if (H.length !== this.numSignals) {
      throw new Error(`Expected ${this.numSignals} alpha signals, got ${H.length}`);
    }

    // 1. Time Update (Predict step):
    // P_prior = P + Q (assuming random walk on alpha weights)
    const P_prior: number[][] = Array.from({ length: this.numSignals }, (_, i) =>
      Array.from({ length: this.numSignals }, (_, j) => (this.P[i]![j]! + this.Q[i]![j]!))
    );

    // Prior prediction: y_pred = H * weights
    let y_pred = 0;
    for (let i = 0; i < this.numSignals; i++) {
      y_pred += (H[i] ?? 0) * (this.weights[i] ?? 0);
    }

    // 2. Innovation:
    const y_innov = obs.realizedPriceChange - y_pred;

    // Innovation covariance S = H * P_prior * H^T + R
    let S = this.R;
    const PH: number[] = new Array(this.numSignals).fill(0);
    for (let i = 0; i < this.numSignals; i++) {
      for (let j = 0; j < this.numSignals; j++) {
        PH[i] += (P_prior[i]![j]! * (H[j] ?? 0));
      }
      S += (H[i] ?? 0) * PH[i]!;
    }

    // Kalman Gain K = P_prior * H^T / S
    const K: number[] = new Array(this.numSignals).fill(0);
    for (let i = 0; i < this.numSignals; i++) {
      K[i] = PH[i]! / S;
    }

    // 3. Measurement Update (Correct step):
    // weights = weights + K * y_innov
    for (let i = 0; i < this.numSignals; i++) {
      this.weights[i] = (this.weights[i] ?? 0) + (K[i] ?? 0) * y_innov;
    }

    // P = (I - K * H) * P_prior
    for (let i = 0; i < this.numSignals; i++) {
      for (let j = 0; j < this.numSignals; j++) {
        let sum = 0;
        for (let k = 0; k < this.numSignals; k++) {
          const I_minus_KH = (i === k ? 1.0 : 0.0) - (K[i] ?? 0) * (H[k] ?? 0);
          sum += I_minus_KH * P_prior[k]![j]!;
        }
        this.P[i]![j] = sum;
      }
    }

    return {
      weights: this.weights.map((w) => Number(w.toFixed(6))),
      covarianceMatrix: this.P.map((row) => row.map((v) => Number(v.toFixed(6)))),
      predictedReturn: Number(y_pred.toFixed(6)),
      estimationVariance: Number(S.toFixed(6)),
      kalmanGain: K.map((k) => Number(k.toFixed(6))),
    };
  }

  public getWeights(): number[] {
    return [...this.weights];
  }
}
