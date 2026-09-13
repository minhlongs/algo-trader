/**
 * GRU Strategy Core Implementation
 */

import { GruModel } from '../ml/gru/gru-model';
import { DataPreprocessor, type OhlcvData, prepareTrainingData } from '../ml/gru/data-preprocessor';
import { logger } from '../../shared/utils/logger';
import {
  type ISignal,
  type IStrategy,
  type GruStrategyConfig,
  DEFAULT_GRU_STRATEGY_CONFIG,
  toGruModelConfig,
  buildGruSignal,
} from './gru-strategy-types';

export class GruStrategy implements IStrategy {
  private model: GruModel;
  private config: GruStrategyConfig;
  private preprocessor: DataPreprocessor;
  private priceHistory: OhlcvData[] = [];
  private trained: boolean = false;
  private candleCount: number = 0;

  constructor(config: Partial<GruStrategyConfig> = {}) {
    this.config = { ...DEFAULT_GRU_STRATEGY_CONFIG, ...config };
    this.model = new GruModel(toGruModelConfig(this.config));
    this.preprocessor = new DataPreprocessor(this.config.inputSteps, this.config.outputSteps);
  }

  getName(): string {
    return 'GRU Neural Network';
  }

  /** Initialize strategy - build model */
  async initialize(): Promise<void> {
    this.model.build();
    logger.info(`[GRU] Model initialized: ${this.config.inputSteps} steps → ${this.config.outputSteps} predictions`);
  }

  /** Train model on historical data */
  async train(candles: OhlcvData[]): Promise<void> {
    const required = this.config.inputSteps + this.config.outputSteps;
    if (candles.length < required) {
      throw new Error(`Insufficient data: need ${required} candles, got ${candles.length}`);
    }

    logger.info(`[GRU] Training on ${candles.length} candles...`);
    const { X, y } = prepareTrainingData(candles, this.config.inputSteps, this.config.outputSteps);
    await this.model.train(X, y, this.config.epochs, this.config.batchSize, 0.2);

    X.dispose();
    y.dispose();

    this.trained = true;
    this.priceHistory = [...candles];
    this.candleCount = candles.length;
    logger.info(`[GRU] Training complete. Model ready.`);
  }

  /** Generate trading signal from current market data */
  async execute(candles: OhlcvData[]): Promise<ISignal> {
    if (!this.trained) {
      return { action: 'wait', confidence: 0, reason: 'Model not trained' };
    }

    this.priceHistory.push(...candles);
    this.candleCount += candles.length;

    const maxHistory = this.config.inputSteps * 2;
    if (this.priceHistory.length > maxHistory) {
      this.priceHistory = this.priceHistory.slice(-maxHistory);
    }

    if (this.priceHistory.length < this.config.inputSteps) {
      return { action: 'wait', confidence: 0, reason: 'Insufficient data' };
    }

    const inputSequence = this.priceHistory.slice(-this.config.inputSteps);
    const features = this.preprocessor.extractFeatures(inputSequence);
    const X = this.preprocessor.normalizeSequence(features);

    const prediction = this.model.predict(X);
    X.dispose();

    if (prediction.confidence < this.config.confidenceThreshold) {
      return {
        action: 'wait',
        confidence: prediction.confidence,
        reason: `Low confidence: ${(prediction.confidence * 100).toFixed(1)}%`,
      };
    }

    return buildGruSignal(prediction);
  }

  getStatus(): { trained: boolean; candlesSeen: number; modelName: string } {
    return {
      trained: this.trained,
      candlesSeen: this.candleCount,
      modelName: this.getName(),
    };
  }

  async saveModel(path: string): Promise<void> {
    if (!this.trained) throw new Error('Cannot save untrained model');
    await this.model.save(path);
    logger.info(`[GRU] Model saved to ${path}`);
  }

  async loadModel(path: string): Promise<void> {
    this.model = await GruModel.load(path);
    this.trained = true;
    logger.info(`[GRU] Model loaded from ${path}`);
  }

  dispose(): void {
    this.model.dispose();
  }
}
