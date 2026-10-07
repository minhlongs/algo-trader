/**
 * Alpha Discovery Genetic Evolution Math & Operators
 *
 * Implements deterministic seeded PRNG, SBX crossover,
 * adaptive Gaussian mutation, and composite fitness calculation.
 */

import type {
  FitnessMetrics,
  FitnessWeights,
  GeneticAlgorithmConfig,
  ParamBound,
} from './genetic-evolution-types';

export class SeededRng {
  private state: number;

  constructor(seed = 42) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  gaussian(mean = 0, std = 1): number {
    const u1 = Math.max(1e-10, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }
}

export function snapToStep(val: number, bound: ParamBound): number {
  const clamped = Math.min(bound.max, Math.max(bound.min, val));
  if (!bound.step || bound.step <= 0) return clamped;
  const steps = Math.round((clamped - bound.min) / bound.step);
  const snapped = bound.min + steps * bound.step;
  return Math.min(bound.max, Math.max(bound.min, Number(snapped.toFixed(6))));
}

export function computeCompositeFitness(
  fitness: FitnessMetrics,
  weights: FitnessWeights,
  gateConfig?: GeneticAlgorithmConfig['gateConfig'],
): { score: number; gated: boolean } {
  const isGated = Boolean(
    gateConfig &&
      (fitness.deflatedSharpeRatio < gateConfig.minDsr ||
        fitness.sharpeRatio < gateConfig.minSharpe ||
        fitness.complexityPenalty > gateConfig.maxComplexity),
  );

  const rawScore =
    weights.sharpeWeight * fitness.sharpeRatio +
    weights.sortinoWeight * fitness.sortinoRatio +
    weights.dsrWeight * fitness.deflatedSharpeRatio -
    weights.complexityWeight * fitness.complexityPenalty;

  return {
    score: isGated ? rawScore - 1000 : rawScore,
    gated: isGated,
  };
}

export function sbxCrossover(
  p1: number,
  p2: number,
  bound: ParamBound,
  eta: number,
  rng: SeededRng,
): [number, number] {
  if (Math.abs(p1 - p2) < 1e-9) return [p1, p2];
  const u = rng.next();
  const beta = u <= 0.5 ? Math.pow(2 * u, 1 / (eta + 1)) : Math.pow(1 / (2 * (1 - u)), 1 / (eta + 1));
  const c1 = snapToStep(0.5 * ((1 + beta) * p1 + (1 - beta) * p2), bound);
  const c2 = snapToStep(0.5 * ((1 - beta) * p1 + (1 + beta) * p2), bound);
  return [c1, c2];
}

export function mutateGene(
  gene: number,
  bound: ParamBound,
  sigma: number,
  adaptiveRatio: number,
  rng: SeededRng,
): number {
  const range = bound.max - bound.min;
  const effectiveSigma = sigma * adaptiveRatio * (range || 1.0);
  const delta = rng.gaussian(0, effectiveSigma);
  return snapToStep(gene + delta, bound);
}
