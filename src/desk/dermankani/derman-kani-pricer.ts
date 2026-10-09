/**
 * Derman-Kani (1994) Backward Induction Option Pricing
 *
 * Prices European & American options and computes Greek derivatives (delta, gamma, theta)
 * through backward induction over a calibrated Derman-Kani local volatility tree.
 *
 * @module desk/dermankani/derman-kani-pricer
 */

import type {
  DermanKaniTree,
  TreeOptionPricingInput,
  TreeOptionPricingResult,
} from './derman-kani-types';

export function priceOptionOnTree(
  tree: DermanKaniTree,
  input: TreeOptionPricingInput,
): TreeOptionPricingResult {
  const { optionType, exerciseStyle, strike } = input;
  const { steps, dt, discountStep, nodes } = tree;

  // Payoff function
  const payoff = (s: number): number => {
    return optionType === 'call' ? Math.max(0, s - strike) : Math.max(0, strike - s);
  };

  // 1. Price American (or European) backwards
  const n = steps;
  let values: number[] = nodes[n].map((node) => payoff(node.stockPrice));

  // Store intermediate values at step 1 and step 2 for Greek calculation
  let valStep1: number[] = [];
  let valStep2: number[] = [];

  for (let step = n - 1; step >= 0; step--) {
    const nextVals: number[] = [];
    const layer = nodes[step];

    for (let j = 0; j <= step; j++) {
      const p = layer[j].transitionProbUp;
      const continuation = discountStep * (p * values[j + 1] + (1 - p) * values[j]);

      if (exerciseStyle === 'american') {
        const earlyExercise = payoff(layer[j].stockPrice);
        nextVals.push(Math.max(earlyExercise, continuation));
      } else {
        nextVals.push(continuation);
      }
    }

    if (step === 2) {
      valStep2 = [...nextVals];
    }
    if (step === 1) {
      valStep1 = [...nextVals];
    }

    values = nextVals;
  }

  const price = values[0];

  // 2. Compute European equivalent for early exercise premium
  let euroValues: number[] = nodes[n].map((node) => payoff(node.stockPrice));
  for (let step = n - 1; step >= 0; step--) {
    const layer = nodes[step];
    const nextVals: number[] = [];
    for (let j = 0; j <= step; j++) {
      const p = layer[j].transitionProbUp;
      const continuation = discountStep * (p * euroValues[j + 1] + (1 - p) * euroValues[j]);
      nextVals.push(continuation);
    }
    euroValues = nextVals;
  }
  const euroPrice = euroValues[0];
  const earlyExercisePremium = exerciseStyle === 'american' ? Math.max(0, price - euroPrice) : 0;

  // 3. Greeks at root node (step 0)
  // Delta = (V(1, 1) - V(1, 0)) / (S(1, 1) - S(1, 0))
  let delta = 0;
  let gamma = 0;
  let theta = 0;

  if (steps >= 1 && valStep1.length >= 2) {
    const s11 = nodes[1][1].stockPrice;
    const s10 = nodes[1][0].stockPrice;
    delta = (valStep1[1] - valStep1[0]) / (s11 - s10);
  }

  if (steps >= 2 && valStep2.length >= 3) {
    const s22 = nodes[2][2].stockPrice;
    const s21 = nodes[2][1].stockPrice;
    const s20 = nodes[2][0].stockPrice;
    const dUp = (valStep2[2] - valStep2[1]) / (s22 - s21);
    const dDown = (valStep2[1] - valStep2[0]) / (s21 - s20);
    const h = 0.5 * (s22 - s20);
    gamma = (dUp - dDown) / h;

    // Theta ~ (V(2, 1) - V(0, 0)) / (2 * dt)
    theta = (valStep2[1] - price) / (2 * dt);
  }

  return {
    price,
    delta,
    gamma,
    theta,
    earlyExercisePremium,
  };
}
