import { describe, it, expect } from 'vitest';
import {
  GeneticEvolutionEngine,
  SeededRng,
  computeCompositeFitness,
  mutateGene,
  sbxCrossover,
  snapToStep,
} from '../../../src/alpha-lab/alpha-discovery/genetic-evolution-engine';
import type {
  Chromosome,
  FitnessMetrics,
  GeneticAlgorithmConfig,
} from '../../../src/alpha-lab/alpha-discovery/genetic-evolution-types';

describe('Genetic Evolution: SeededRng and Operators', () => {
  it('generates deterministic pseudo-random sequences given the same seed', () => {
    const rng1 = new SeededRng(12345);
    const rng2 = new SeededRng(12345);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
    expect(seq1.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('generates Gaussian distributed samples centered near mean', () => {
    const rng = new SeededRng(999);
    const samples = Array.from({ length: 1000 }, () => rng.gaussian(10, 2));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

    expect(mean).toBeGreaterThan(9.5);
    expect(mean).toBeLessThan(10.5);
  });

  it('correctly clamps and snaps values to parameter step', () => {
    const bound = { min: 10, max: 50, step: 5 };
    expect(snapToStep(7, bound)).toBe(10);
    expect(snapToStep(55, bound)).toBe(50);
    expect(snapToStep(23, bound)).toBe(25);
    expect(snapToStep(22, bound)).toBe(20);

    const continuousBound = { min: 0.1, max: 0.9 };
    expect(snapToStep(0.05, continuousBound)).toBe(0.1);
    expect(snapToStep(0.55, continuousBound)).toBe(0.55);
  });

  it('performs Simulated Binary Crossover (SBX) within parameter bounds', () => {
    const rng = new SeededRng(42);
    const bound = { min: 10, max: 100, step: 1 };
    const p1 = 30;
    const p2 = 70;

    const [c1, c2] = sbxCrossover(p1, p2, bound, 20, rng);
    expect(c1).toBeGreaterThanOrEqual(bound.min);
    expect(c1).toBeLessThanOrEqual(bound.max);
    expect(c2).toBeGreaterThanOrEqual(bound.min);
    expect(c2).toBeLessThanOrEqual(bound.max);
  });

  it('mutates gene with adaptive Gaussian perturbation within bounds', () => {
    const rng = new SeededRng(42);
    const bound = { min: 5, max: 20, step: 1 };
    const original = 10;

    const mutated = mutateGene(original, bound, 0.1, 1.0, rng);
    expect(mutated).toBeGreaterThanOrEqual(bound.min);
    expect(mutated).toBeLessThanOrEqual(bound.max);
    expect(Number.isInteger(mutated)).toBe(true);
  });
});

describe('Genetic Evolution: Composite Fitness and Gating', () => {
  const weights = { sharpeWeight: 1.0, sortinoWeight: 0.5, dsrWeight: 2.0, complexityWeight: 0.1 };

  it('computes composite fitness score accurately', () => {
    const fitness: FitnessMetrics = {
      sharpeRatio: 2.0,
      sortinoRatio: 3.0,
      deflatedSharpeRatio: 0.98,
      complexityPenalty: 4.0,
    };
    const res = computeCompositeFitness(fitness, weights);
    expect(res.score).toBeCloseTo(5.06, 4);
    expect(res.gated).toBe(false);
  });

  it('penalizes chromosomes failing the DSR statistical gate', () => {
    const fitness: FitnessMetrics = {
      sharpeRatio: 2.5,
      sortinoRatio: 3.5,
      deflatedSharpeRatio: 0.85,
      complexityPenalty: 3.0,
    };
    const gateConfig = { minDsr: 0.95, minSharpe: 1.0, maxComplexity: 5.0 };
    const res = computeCompositeFitness(fitness, weights, gateConfig);
    expect(res.gated).toBe(true);
    expect(res.score).toBeLessThan(-500);
  });

  it('penalizes chromosomes exceeding maximum complexity penalty', () => {
    const fitness: FitnessMetrics = {
      sharpeRatio: 3.0,
      sortinoRatio: 4.0,
      deflatedSharpeRatio: 0.99,
      complexityPenalty: 12.0,
    };
    const gateConfig = { minDsr: 0.95, minSharpe: 1.0, maxComplexity: 8.0 };
    const res = computeCompositeFitness(fitness, weights, gateConfig);
    expect(res.gated).toBe(true);
    expect(res.score).toBeLessThan(-500);
  });
});

describe('Genetic Evolution: Full Engine Optimization', () => {
  const testConfig: GeneticAlgorithmConfig = {
    populationSize: 20,
    generations: 8,
    tournamentSizeK: 3,
    eliteCount: 2,
    crossoverConfig: { crossoverRate: 0.8, distributionIndexEta: 15 },
    mutationConfig: { mutationRate: 0.25, gaussianSigma: 0.1, adaptiveScale: true },
    fitnessWeights: {
      sharpeWeight: 1.0,
      sortinoWeight: 0.5,
      dsrWeight: 1.5,
      complexityWeight: 0.05,
    },
    paramBounds: {
      lookback: { min: 10, max: 100, step: 5 },
      threshold: { min: 1.0, max: 5.0, step: 0.5 },
      stopLossPct: { min: 0.01, max: 0.10, step: 0.01 },
    },
    gateConfig: { minDsr: 0.90, minSharpe: 0.5, maxComplexity: 10.0 },
    seed: 777,
  };

  // Mock fitness evaluator where target optimal params are lookback=50, threshold=3.0, stopLossPct=0.05
  const mockEvaluator = (chromo: Chromosome): FitnessMetrics => {
    const d1 = Math.abs(chromo.genes.lookback! - 50) / 50;
    const d2 = Math.abs(chromo.genes.threshold! - 3.0) / 2.0;
    const d3 = Math.abs(chromo.genes.stopLossPct! - 0.05) / 0.05;
    const totalDist = d1 + d2 + d3;

    const sharpe = Math.max(0.1, 3.0 - totalDist * 1.5);
    const sortino = sharpe * 1.3;
    const dsr = Math.min(0.99, Math.max(0.7, 0.98 - totalDist * 0.1));
    const complexity = Object.keys(chromo.genes).length;

    return {
      sharpeRatio: sharpe,
      sortinoRatio: sortino,
      deflatedSharpeRatio: dsr,
      complexityPenalty: complexity,
    };
  };

  it('runs deterministic evolution and improves fitness across generations', async () => {
    const engine = new GeneticEvolutionEngine(testConfig);
    const result = await engine.evolve('momentum-family', mockEvaluator);

    expect(result.generationHistory.length).toBe(testConfig.generations + 1);
    expect(result.finalPopulation.length).toBe(testConfig.populationSize);
    expect(result.bestChromosome).toBeDefined();

    const gen0Best = result.generationHistory[0]!.bestFitness;
    const genFinalBest = result.generationHistory[result.generationHistory.length - 1]!.bestFitness;

    // Fitness should monotonically improve or stay equal due to elitism
    expect(genFinalBest).toBeGreaterThanOrEqual(gen0Best);
    expect(result.bestChromosome.fitness?.sharpeRatio).toBeGreaterThan(1.5);
  });

  it('produces 100% identical evolution results across identical runs with same seed', async () => {
    const engine1 = new GeneticEvolutionEngine(testConfig);
    const engine2 = new GeneticEvolutionEngine(testConfig);

    const res1 = await engine1.evolve('reversion-family', mockEvaluator);
    const res2 = await engine2.evolve('reversion-family', mockEvaluator);

    expect(res1.bestChromosome.genes).toEqual(res2.bestChromosome.genes);
    expect(res1.bestChromosome.compositeScore).toBe(res2.bestChromosome.compositeScore);
    expect(res1.totalEvaluations).toBe(res2.totalEvaluations);
  });
});
