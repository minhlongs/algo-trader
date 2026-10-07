/**
 * Alpha Discovery Strategy Genetic Evolution Engine
 *
 * Deterministic GA with SBX crossover, adaptive Gaussian mutation,
 * k-tournament selection, and DSR multi-objective regularized fitness gate.
 */

import type {
  Chromosome,
  EvolutionSummary,
  FitnessEvaluator,
  GeneticAlgorithmConfig,
  GenerationStats,
} from './genetic-evolution-types';
import {
  SeededRng,
  computeCompositeFitness,
  mutateGene,
  sbxCrossover,
  snapToStep,
} from './genetic-evolution-math';

export { SeededRng, computeCompositeFitness, mutateGene, sbxCrossover, snapToStep };

export class GeneticEvolutionEngine {
  private rng: SeededRng;

  constructor(private config: GeneticAlgorithmConfig) {
    this.rng = new SeededRng(config.seed ?? 42);
  }

  createInitialPopulation(familyId: string): Chromosome[] {
    const pop: Chromosome[] = [];
    for (let i = 0; i < this.config.populationSize; i++) {
      const genes: Record<string, number> = {};
      for (const [key, bound] of Object.entries(this.config.paramBounds)) {
        const raw = bound.min + this.rng.next() * (bound.max - bound.min);
        genes[key] = snapToStep(raw, bound);
      }
      pop.push({ id: `gen0_ind${i}`, familyId, genes, generation: 0 });
    }
    return pop;
  }

  tournamentSelect(pop: Chromosome[]): Chromosome {
    const k = Math.min(this.config.tournamentSizeK, pop.length);
    let best = pop[Math.floor(this.rng.next() * pop.length)]!;
    for (let i = 1; i < k; i++) {
      const cand = pop[Math.floor(this.rng.next() * pop.length)]!;
      if ((cand.compositeScore ?? -Infinity) > (best.compositeScore ?? -Infinity)) best = cand;
    }
    return best;
  }

  async evolve(familyId: string, evaluator: FitnessEvaluator): Promise<EvolutionSummary> {
    let pop = this.createInitialPopulation(familyId);
    await this.evaluatePopulation(pop, evaluator);
    const history: GenerationStats[] = [this.calcStats(pop, 0)];
    let evaluations = pop.length;

    for (let gen = 1; gen <= this.config.generations; gen++) {
      pop.sort((a, b) => (b.compositeScore ?? -Infinity) - (a.compositeScore ?? -Infinity));
      const eliteCount = this.config.eliteCount ?? 1;
      const nextGen: Chromosome[] = pop.slice(0, eliteCount).map((c) => ({ ...c, generation: gen }));
      const adaptiveRatio = this.config.mutationConfig.adaptiveScale
        ? Math.max(0.2, 1.0 - (gen / this.config.generations) * 0.7)
        : 1.0;

      while (nextGen.length < this.config.populationSize) {
        const p1 = this.tournamentSelect(pop);
        const p2 = this.tournamentSelect(pop);
        const doCross = this.rng.next() < this.config.crossoverConfig.crossoverRate;
        const g1: Record<string, number> = {};
        const g2: Record<string, number> = {};

        for (const [key, bound] of Object.entries(this.config.paramBounds)) {
          if (doCross) {
            const [c1, c2] = sbxCrossover(p1.genes[key]!, p2.genes[key]!, bound, this.config.crossoverConfig.distributionIndexEta, this.rng);
            g1[key] = c1;
            g2[key] = c2;
          } else {
            g1[key] = p1.genes[key]!;
            g2[key] = p2.genes[key]!;
          }

          if (this.rng.next() < this.config.mutationConfig.mutationRate) {
            g1[key] = mutateGene(g1[key]!, bound, this.config.mutationConfig.gaussianSigma, adaptiveRatio, this.rng);
          }
          if (this.rng.next() < this.config.mutationConfig.mutationRate) {
            g2[key] = mutateGene(g2[key]!, bound, this.config.mutationConfig.gaussianSigma, adaptiveRatio, this.rng);
          }
        }

        nextGen.push({ id: `gen${gen}_ind${nextGen.length}`, familyId, genes: g1, generation: gen });
        if (nextGen.length < this.config.populationSize) {
          nextGen.push({ id: `gen${gen}_ind${nextGen.length}`, familyId, genes: g2, generation: gen });
        }
      }

      await this.evaluatePopulation(nextGen.slice(eliteCount), evaluator);
      evaluations += nextGen.length - eliteCount;
      pop = nextGen;
      history.push(this.calcStats(pop, gen));
    }

    pop.sort((a, b) => (b.compositeScore ?? -Infinity) - (a.compositeScore ?? -Infinity));
    return {
      bestChromosome: pop[0]!,
      finalPopulation: pop,
      generationHistory: history,
      totalEvaluations: evaluations,
      converged: history.length > 2 && Math.abs(history[history.length - 1]!.bestFitness - history[history.length - 2]!.bestFitness) < 1e-4,
    };
  }

  private async evaluatePopulation(pop: Chromosome[], evaluator: FitnessEvaluator): Promise<void> {
    for (const ind of pop) {
      ind.fitness = await evaluator(ind);
      const res = computeCompositeFitness(ind.fitness, this.config.fitnessWeights, this.config.gateConfig);
      ind.compositeScore = res.score;
      ind.gated = res.gated;
    }
  }

  private calcStats(pop: Chromosome[], gen: number): GenerationStats {
    const scores = pop.map((c) => c.compositeScore ?? 0);
    const best = pop.reduce((acc, c) => ((c.compositeScore ?? -Infinity) > (acc.compositeScore ?? -Infinity) ? c : acc), pop[0]!);
    const mean = scores.reduce((sum, s) => sum + s, 0) / pop.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / pop.length;
    return {
      generation: gen,
      bestFitness: best.compositeScore ?? 0,
      meanFitness: mean,
      diversity: Math.sqrt(variance),
      bestChromosome: { ...best },
    };
  }
}
