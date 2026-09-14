import * as tf from '@tensorflow/tfjs';
import type { GruModelConfig } from './gru-types';

/**
 * Build and compile GRU layers model based on configuration.
 */
export function buildGruLayers(config: GruModelConfig): tf.LayersModel {
  const model = tf.sequential();

  // GRU Layer 1
  model.add(
    tf.layers.gru({
      inputShape: [config.inputSteps, config.featureCount],
      units: config.gruUnits,
      returnSequences: true,
      dropout: config.dropoutRate,
      recurrentDropout: config.dropoutRate,
    }),
  );

  // GRU Layer 2
  model.add(
    tf.layers.gru({
      units: Math.floor(config.gruUnits / 2),
      returnSequences: false,
      dropout: config.dropoutRate,
      recurrentDropout: config.dropoutRate,
    }),
  );

  // Dense Layer
  model.add(
    tf.layers.dense({
      units: config.denseUnits,
      activation: 'relu',
    }),
  );

  // Output Layer (predict next N candles)
  model.add(
    tf.layers.dense({
      units: config.outputSteps,
      activation: 'linear',
    }),
  );

  // Compile
  model.compile({
    optimizer: tf.train.adam(config.learningRate),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}
