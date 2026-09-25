/**
 * AI/ML Signal Adapter (Facade)
 *
 * Bridges alpha-lab ML model outputs into the live TradingPipeline.
 */

export {
  type AISignalConfig,
  type AISignal,
  type AISignalValidationResult,
} from './ai-signal-adapter-types';

export { candidateToAISignal } from './ai-signal-candidate-mapper';
export { AISignalAdapter } from './ai-signal-adapter-class';
