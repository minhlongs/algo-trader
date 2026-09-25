/**
 * Candidate Generator Parameter Sampling Functions
 */

/**
 * Deterministic pseudo-random number generator (LCG).
 */
export function createLcg(seed = 42): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Snaps a value to the nearest step within [min, max].
 */
export function snapToStep(val: number, min: number, max: number, step?: number): number {
  if (!step || step <= 0) return Math.max(min, Math.min(max, val));
  const stepStr = step.toString();
  const precision = stepStr.includes('.') ? (stepStr.split('.')[1]?.length ?? 0) : 0;
  const factor = Math.pow(10, Math.min(8, precision + 2));
  const steps = Math.round(Math.round((val - min) * factor) / Math.round(step * factor));
  const snapped = min + steps * step;
  const rounded = Number(snapped.toFixed(precision));
  return Math.max(min, Math.min(max, rounded));
}

/**
 * Generate coarse grid combinations for parameter bounds.
 */
export function sampleParamGrid(
  bounds: Record<string, { min: number; max: number; step?: number }>,
  defaults: Record<string, number>,
  options?: { stepsPerParam?: number; maxCombinations?: number },
): Record<string, number>[] {
  const stepsPerParam = options?.stepsPerParam ?? 3;
  const maxCombos = options?.maxCombinations ?? 20;

  const paramKeys = Object.keys(defaults);
  const paramValues: Record<string, number[]> = {};

  for (const key of paramKeys) {
    const bound = bounds[key];
    if (!bound) {
      paramValues[key] = [defaults[key] ?? 0];
      continue;
    }
    const { min, max, step } = bound;
    const vals = new Set<number>();
    vals.add(defaults[key] ?? min);
    vals.add(min);
    vals.add(max);

    if (stepsPerParam > 3) {
      const stride = (max - min) / (stepsPerParam - 1);
      for (let i = 1; i < stepsPerParam - 1; i++) {
        vals.add(snapToStep(min + i * stride, min, max, step));
      }
    }
    paramValues[key] = Array.from(vals).sort((a, b) => a - b);
  }

  // Cartesian product
  let combinations: Record<string, number>[] = [{}];
  for (const key of paramKeys) {
    const next: Record<string, number>[] = [];
    const valuesForKey = paramValues[key] ?? [0];
    for (const prefix of combinations) {
      for (const val of valuesForKey) {
        next.push({ ...prefix, [key]: val });
      }
    }
    combinations = next;
    if (combinations.length > maxCombos * 4) {
      break;
    }
  }

  // Ensure defaultParams is first, then slice to maxCombinations
  const defaultSerialized = JSON.stringify(defaults);
  combinations.sort((a, b) => {
    if (JSON.stringify(a) === defaultSerialized) return -1;
    if (JSON.stringify(b) === defaultSerialized) return 1;
    return 0;
  });

  return combinations.slice(0, maxCombos);
}

/**
 * Generate deterministic random samples within parameter bounds.
 */
export function sampleParamRandom(
  bounds: Record<string, { min: number; max: number; step?: number }>,
  defaults: Record<string, number>,
  count: number,
  seed = 42,
): Record<string, number>[] {
  if (count <= 1) return [{ ...defaults }];

  const rng = createLcg(seed);
  const results: Record<string, number>[] = [{ ...defaults }];
  const paramKeys = Object.keys(defaults);

  for (let i = 1; i < count; i++) {
    const params: Record<string, number> = {};
    for (const key of paramKeys) {
      const bound = bounds[key];
      const defaultVal = defaults[key] ?? 0;
      if (!bound) {
        params[key] = defaultVal;
        continue;
      }
      const r = rng();
      const raw = bound.min + r * (bound.max - bound.min);
      params[key] = snapToStep(raw, bound.min, bound.max, bound.step);
    }
    results.push(params);
  }

  return results;
}
