/**
 * Strategy Loader Types
 */

export interface StrategyRegistryEntry {
  name: string;
  module: string;
  category: string;
  priority: number; // 1-10, lower = higher priority
  memoryFootprintMb: number;
  isHeavy: boolean; // ML/LLM-based strategies
}
