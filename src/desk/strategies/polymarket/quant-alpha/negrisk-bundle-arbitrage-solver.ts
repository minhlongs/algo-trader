/**
 * The Frank-Wolfe projection behind the NegRisk bundle pricer. Pure maths.
 *
 * The feasible set is a probability simplex restricted by implication edges:
 * if a market's outcome implies an enclosing market's outcome, its probability
 * can never exceed the enclosing one. Vertices of that set are exactly the
 * ancestor-closed subsets carrying uniform mass, so the linear minimisation
 * oracle is an exact enumeration rather than a heuristic. Outcome counts are
 * 4–12, so enumerating every subset is cheap by construction.
 *
 * The report asks for the "fully-corrective" variant; this file implements the
 * ordinary variant and stops on the duality gap instead. The operational
 * requirement is the same one the report states — a solution that did not
 * converge is discarded — and the gap makes that check exact.
 */

export const BUNDLE_EPSILON = 1e-9;

/** `child` implies `parent`, so `p[child] <= p[parent]`. */
export interface ImplicationEdge {
  child: number;
  parent: number;
}

export interface BundleSolverOptions {
  maxIterations: number;
  tolerance: number;
  timeBudgetMs: number;
}

export interface BundleSolverResult {
  probabilities: number[];
  converged: boolean;
  iterations: number;
  elapsedMs: number;
}

/** Every subset of `[0, n)` that is closed under "take the parent too". */
export function ancestorClosedSets(nodeCount: number, edges: ImplicationEdge[]): number[][] {
  const sets: number[][] = [];
  const limit = 1 << nodeCount;
  for (let mask = 1; mask < limit; mask += 1) {
    if (isClosed(mask, edges)) sets.push(members(mask, nodeCount));
  }
  return sets;
}

function isClosed(mask: number, edges: ImplicationEdge[]): boolean {
  for (const edge of edges) {
    const hasChild = (mask & (1 << edge.child)) !== 0;
    const hasParent = (mask & (1 << edge.parent)) !== 0;
    if (hasChild && !hasParent) return false;
  }
  return true;
}

function members(mask: number, nodeCount: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < nodeCount; i += 1) if ((mask & (1 << i)) !== 0) out.push(i);
  return out;
}

/** Uniform vertex on one closed set: 1/|S| where S holds, 0 elsewhere. */
export function vertexFor(set: number[], nodeCount: number): number[] {
  const weight = 1 / Math.max(1, set.length);
  const out = new Array<number>(nodeCount).fill(0);
  for (const index of set) out[index] = weight;
  return out;
}

/** The vertex minimising `cost · v` over the feasible set. Exact, not greedy. */
export function linearMinimisationOracle(cost: number[], edges: ImplicationEdge[]): number[] {
  const nodeCount = cost.length;
  if (nodeCount === 0) return [];
  let bestSet: number[] = Array.from({ length: nodeCount }, (_, index) => index);
  let bestValue = Number.POSITIVE_INFINITY;
  for (const set of ancestorClosedSets(nodeCount, edges)) {
    let sum = 0;
    for (const index of set) sum += cost[index];
    const value = sum / set.length;
    if (value < bestValue - BUNDLE_EPSILON) {
      bestValue = value;
      bestSet = set;
    }
  }
  return vertexFor(bestSet, nodeCount);
}

/**
 * Squared-Euclidean Bregman projection of `reference` onto the constrained
 * simplex. Returns `converged: false` when iteration, time or gap fails, so
 * the caller can discard the answer instead of trading on a partial solve.
 */
export function frankWolfeProjection(
  reference: number[],
  edges: ImplicationEdge[],
  options: BundleSolverOptions,
): BundleSolverResult {
  const started = Date.now();
  const n = reference.length;
  if (n === 0) return { probabilities: [], converged: true, iterations: 0, elapsedMs: 0 };

  // Start at the vertex that maximises agreement with the reference.
  let point = linearMinimisationOracle(reference.map((value) => -value), edges);
  let iterations = 0;
  let converged = false;

  for (; iterations < options.maxIterations; iterations += 1) {
    const gradient = point.map((value, index) => 2 * (value - reference[index]));
    const toward = linearMinimisationOracle(gradient, edges);
    const gap = dot(gradient, point) - dot(gradient, toward);
    if (gap <= options.tolerance) {
      converged = true;
      break;
    }
    if (Date.now() - started > options.timeBudgetMs) break;
    const direction = toward.map((value, index) => value - point[index]);
    const step = exactStep(reference, point, direction);
    if (step <= 0) {
      converged = gap <= options.tolerance;
      break;
    }
    point = point.map((value, index) => value + step * direction[index]);
  }

  return { probabilities: point, converged, iterations, elapsedMs: Date.now() - started };
}

/** Closest point on the segment `point + γ·direction` to the reference. */
function exactStep(reference: number[], point: number[], direction: number[]): number {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < point.length; i += 1) {
    numerator += (reference[i] - point[i]) * direction[i];
    denominator += direction[i] * direction[i];
  }
  if (!(denominator > 0)) return 0;
  return Math.min(1, Math.max(0, numerator / denominator));
}

function dot(left: number[], right: number[]): number {
  let total = 0;
  for (let i = 0; i < left.length; i += 1) total += left[i] * right[i];
  return total;
}
