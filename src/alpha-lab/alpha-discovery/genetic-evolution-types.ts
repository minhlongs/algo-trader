/**
 * Alpha Discovery Strategy Genetic Evolution Types
 *
 * Multi-objective chromosome definitions, mutation/crossover parameters,
 * and statistical regularization fitness metrics (Sharpe, Sortino, DSR, Complexity).
 */

export interface ParamBound {
  min: number;
  max: number;
  step?: number;
}

export interface FitnessMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  deflatedSharpeRatio: number; // DSR Bailey & Lopez de Prado (2014)
  complexityPenalty: number;   // Model degrees of freedom / parameter complexity
  maxDrawdown?: number;
  winRate?: number;
  profitFactor?: number;
}

export interface FitnessWeights {
  sharpeWeight: number;
  sortinoWeight: number;
  dsrWeight: number;
  complexityWeight: number;
}

export interface GeneticGateConfig {
  minDsr: number;        // e.g. 0.95
  minSharpe: number;     // e.g. 1.0
  maxComplexity: number; // e.g. 8.0
}

export interface CrossoverConfig {
  crossoverRate: number;        // Probability of crossover [0, 1]
  distributionIndexEta: number; // SBX index eta (e.g. 20)
}

export interface MutationConfig {
  mutationRate: number;    // Probability per gene mutation [0, 1]
  gaussianSigma: number;   // Base mutation step standard deviation
  adaptiveScale?: boolean; // Decay sigma over generations
}

export interface Chromosome {
  id: string;
  familyId: string;
  genes: Record<string, number>;
  generation: number;
  fitness?: FitnessMetrics;
  compositeScore?: number;
  gated?: boolean;
}

export interface GeneticAlgorithmConfig {
  populationSize: number;
  generations: number;
  tournamentSizeK: number;
  eliteCount?: number;
  crossoverConfig: CrossoverConfig;
  mutationConfig: MutationConfig;
  fitnessWeights: FitnessWeights;
  paramBounds: Record<string, ParamBound>;
  gateConfig?: GeneticGateConfig;
  seed?: number;
}

export interface GenerationStats {
  generation: number;
  bestFitness: number;
  meanFitness: number;
  diversity: number;
  bestChromosome: Chromosome;
}

export interface EvolutionSummary {
  bestChromosome: Chromosome;
  finalPopulation: Chromosome[];
  generationHistory: GenerationStats[];
  totalEvaluations: number;
  converged: boolean;
}

export type FitnessEvaluator = (chromosome: Chromosome) => Promise<FitnessMetrics> | FitnessMetrics;
