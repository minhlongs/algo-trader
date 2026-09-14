/**
 * GRU Neural Network for Crypto Price Prediction
 *
 * Gated Recurrent Unit (GRU) model for time-series forecasting.
 * Predicts next N candles based on historical OHLCV data.
 */

import * as tf from '@tensorflow/tfjs';
import type { GruModelConfig, PredictionResult } from './gru-types';
import { buildGruLayers } from './gru-architecture';

export * from './gru-types';
export { buildGruLayers } from './gru-architecture';

export class GruModel {
  private model: tf.LayersModel | null = null;
  private config: GruModelConfig;
  private isTrained: boolean = false;

  constructor(config: GruModelConfig) {
    this.config = config;
  }

  /**
   * Build GRU model architecture
   */
  build(): tf.LayersModel {
    this.model = buildGruLayers(this.config);
    this.isTrained = false;
    return this.model;
  }

  /**
   * Train model on historical data
   */
  async train(
    X: tf.Tensor3D,
    y: tf.Tensor2D,
    epochs: number = 50,
    batchSize: number = 32,
    validationSplit: number = 0.2,
    callbacks?: tf.CustomCallbackArgs | tf.CustomCallbackArgs[],
  ): Promise<tf.History> {
    if (!this.model) {
      this.build();
    }

    const history = await this.model!.fit(X, y, {
      epochs,
      batchSize,
      validationSplit,
      shuffle: true,
      verbose: 1,
      callbacks,
    });

    this.isTrained = true;
    return history;
  }

  /**
   * Predict next price from input sequence
   */
  predict(X: tf.Tensor3D): PredictionResult {
    if (!this.model || !this.isTrained) {
      throw new Error('Model not trained. Call train() first.');
    }

    const prediction = this.model.predict(X) as tf.Tensor;
    const predictedPrice = prediction.mean().dataSync()[0];

    // Calculate confidence based on prediction variance
    const predictionSquare = prediction.square();
    const meanSquare = predictionSquare.mean().dataSync()[0];
    const mean = prediction.mean().dataSync()[0];
    const variance = meanSquare - mean * mean;
    const confidence = Math.max(0, Math.min(1, 1 - variance * 10));

    // Determine trend
    const inputMean = X.mean().dataSync()[0];
    const trend: 'up' | 'down' | 'neutral' =
      predictedPrice > inputMean * 1.002 ? 'up' :
      predictedPrice < inputMean * 0.998 ? 'down' : 'neutral';

    prediction.dispose();

    return {
      predictedPrice,
      confidence,
      trend,
    };
  }

  /**
   * Save model to file
   */
  async save(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('Model not built yet.');
    }
    await this.model.save(`file://${path}`);
  }

  /**
   * Load model from file
   */
  static async load(path: string): Promise<GruModel> {
    const model = await tf.loadLayersModel(`file://${path}`);
    const instance = new GruModel({
      inputSteps: 60,
      featureCount: 5,
      gruUnits: 64,
      denseUnits: 32,
      outputSteps: 1,
      learningRate: 0.001,
      dropoutRate: 0.2,
    });
    instance.model = model;
    instance.isTrained = true;
    return instance;
  }

  /**
   * Get model summary
   */
  summary(): void {
    if (!this.model) {
      throw new Error('Model not built yet.');
    }
    this.model.summary();
  }

  /**
   * Check if model is trained
   */
  getIsTrained(): boolean {
    return this.isTrained;
  }

  /**
   * Dispose model to free memory
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}
