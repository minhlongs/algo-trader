import * as tf from '@tensorflow/tfjs';

export interface GruModelConfig {
  inputSteps: number; // Number of historical candles (e.g., 60)
  featureCount: number; // Number of features per candle (e.g., 5: O,H,L,C,V)
  gruUnits: number; // GRU layer size (e.g., 64, 128)
  denseUnits: number; // Dense layer size (e.g., 32)
  outputSteps: number; // Number of candles to predict (e.g., 1, 5)
  learningRate: number; // Learning rate (e.g., 0.001)
  dropoutRate: number; // Dropout rate (e.g., 0.2)
}

export interface TrainingData {
  X: tf.Tensor3D; // [samples, timesteps, features]
  y: tf.Tensor2D; // [samples, outputSteps]
}

export interface PredictionResult {
  predictedPrice: number;
  confidence: number;
  trend: 'up' | 'down' | 'neutral';
}
