/**
 * TPE Bayesian Optimizer
 *
 * Implements a simplified TPE (Tree-structured Parzen Estimator) approach for
 * hyperparameter optimization.
 */

export interface ParamSpace {
  name: string;
  min: number;
  max: number;
}

export interface Trial {
  params: Record<string, number>;
  score: number;
}

export class TPEOptimizer {
  private history: Trial[] = [];

  constructor(private space: ParamSpace[]) {}

  // Suggest params using random sampling for the first phase,
  // TPE would then use Kernel Density Estimation on past trials.
  suggest(): Record<string, number> {
    const params: Record<string, number> = {};
    for (const p of this.space) {
      params[p.name] = Math.random() * (p.max - p.min) + p.min;
    }
    return params;
  }

  record(trial: Trial): void {
    this.history.push(trial);
  }

  getBest(): Trial | null {
    if (this.history.length === 0) return null;
    return this.history.reduce((a, b) => (a.score > b.score ? a : b));
  }
}
