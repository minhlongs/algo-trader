/**
 * GRU Strategy Types and Interfaces
 */

import type { GruModelConfig } from '../ml/gru/gru-model';

export interface ISignal {
  action: 'buy' | 'sell' | 'wait';
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface ICandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IStrategy {
  getName(): string;
  initialize(): Promise<void>;
  train?(candles: ICandle[]): Promise<void>;
  execute(candles: ICandle[]): Promise<ISignal>;
  getStatus?(): Record<string, unknown>;
  dispose?(): void;
}

export interface GruStrategyConfig {
  inputSteps: number;          // Historical candles for input (e.g., 60)
  outputSteps: number;         // Candles to predict (e.g., 1)
  gruUnits: number;            // GRU layer size (e.g., 64)
  denseUnits: number;          // Dense layer size (e.g., 32)
  learningRate: number;        // Training learning rate
  epochs: number;              // Training epochs
  batchSize: number;           // Training batch size
  confidenceThreshold: number; // Min confidence for signal (0.0-1.0)
  retrainInterval: number;     // Retrain every N candles
}

export const DEFAULT_GRU_STRATEGY_CONFIG: GruStrategyConfig = {
  inputSteps: 60,
  outputSteps: 1,
  gruUnits: 64,
  denseUnits: 32,
  learningRate: 0.001,
  epochs: 50,
  batchSize: 32,
  confidenceThreshold: 0.7,
  retrainInterval: 100,
};

export function toGruModelConfig(config: GruStrategyConfig): GruModelConfig {
  return {
    inputSteps: config.inputSteps,
    featureCount: 5, // OHLCV
    gruUnits: config.gruUnits,
    denseUnits: config.denseUnits,
    outputSteps: config.outputSteps,
    learningRate: config.learningRate,
    dropoutRate: 0.2,
  };
}

export function buildGruSignal(prediction: {
  trend: string;
  confidence: number;
  predictedPrice: number;
}): ISignal {
  const action: 'buy' | 'sell' | 'wait' =
    prediction.trend === 'up' ? 'buy' : prediction.trend === 'down' ? 'sell' : 'wait';
  return {
    action,
    confidence: prediction.confidence,
    reason: `GRU prediction: ${prediction.trend.toUpperCase()} (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`,
    metadata: {
      predictedPrice: prediction.predictedPrice,
      trend: prediction.trend,
      modelType: 'GRU',
    },
  };
}
