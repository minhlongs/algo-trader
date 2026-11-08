/**
 * Deterministic LCG stream shared by the Polymarket walk-forward OOS evaluator
 * (`POLY-ALPHA-HUNTER-V4` Stage S5).
 *
 * `Math.random` cannot be used in a reproducibility harness: every walk-forward
 * run must replay the identical episode sequence for a given seed so that a
 * strategy edit is the only thing that moves a reported number.
 */

export interface LinearCongruentialState {
  s: number;
}

/** Advances `state` one step and returns the uniform draw in [0, 1). */
export function nextRand(state: LinearCongruentialState): number {
  state.s = (state.s * 1664525 + 1013904223) >>> 0;
  return state.s / 0x100000000;
}
