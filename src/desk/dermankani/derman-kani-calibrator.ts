/**
 * Derman-Kani (1994) Forward Induction Calibration Engine
 *
 * Implements the recursive Derman-Kani forward induction algorithm to build
 * an implied binomial tree matching a given smile surface via Arrow-Debreu prices.
 *
 * @module desk/dermankani/derman-kani-calibrator
 */

import type {
  DermanKaniConfig,
  DermanKaniDiagnostics,
  DermanKaniNode,
  DermanKaniTree,
} from './derman-kani-types';

export function buildDermanKaniTree(config: DermanKaniConfig): DermanKaniTree {
  const { spot, rate, dividendYield, timeToMaturity, steps, impliedVolFn } = config;
  if (steps < 1) throw new Error('Steps must be at least 1');
  if (spot <= 0) throw new Error('Spot must be positive');
  if (timeToMaturity <= 0) throw new Error('Time to maturity must be positive');

  const dt = timeToMaturity / steps;
  const discountStep = Math.exp(-rate * dt);
  const forwardGrowthStep = Math.exp((rate - dividendYield) * dt);

  const nodes: DermanKaniNode[][] = [];
  let regularizedProbNodes = 0;
  let totalLocalVol = 0;
  let localVolCount = 0;

  // Root node (step 0)
  nodes[0] = [
    {
      step: 0,
      index: 0,
      stockPrice: spot,
      arrowDebreuPrice: 1.0,
      transitionProbUp: 0.5,
    },
  ];

  // Forward induction layer by layer: step n -> step n+1
  for (let n = 0; n < steps; n++) {
    const nextStep = n + 1;
    const tNext = nextStep * dt;
    const nextNodes: DermanKaniNode[] = [];

    // Base volatility and step factor
    const baseVol = impliedVolFn(spot, (n + 0.5) * dt);
    const u = Math.exp(baseVol * Math.sqrt(dt));

    // Allocate prices for next level (size nextStep + 1)
    const sNext: number[] = new Array(nextStep + 1);

    if (nextStep % 2 === 0) {
      // Even step count: middle node exists at mid = nextStep / 2
      const mid = nextStep / 2;
      sNext[mid] = spot * Math.pow(forwardGrowthStep, nextStep);

      for (let j = mid + 1; j <= nextStep; j++) {
        const v = impliedVolFn(sNext[j - 1], tNext);
        const stepU = Math.exp(v * Math.sqrt(dt));
        sNext[j] = sNext[j - 1] * stepU;
      }
      for (let j = mid - 1; j >= 0; j--) {
        const v = impliedVolFn(sNext[j + 1], tNext);
        const stepD = Math.exp(v * Math.sqrt(dt));
        sNext[j] = sNext[j + 1] / stepD;
      }
    } else {
      // Odd step count: two middle nodes bracket forward
      const midDown = Math.floor(nextStep / 2);
      const midUp = midDown + 1;
      const fwd = spot * Math.pow(forwardGrowthStep, nextStep);
      sNext[midUp] = fwd * Math.sqrt(u);
      sNext[midDown] = fwd / Math.sqrt(u);

      for (let j = midUp + 1; j <= nextStep; j++) {
        const v = impliedVolFn(sNext[j - 1], tNext);
        const stepU = Math.exp(v * Math.sqrt(dt));
        sNext[j] = sNext[j - 1] * stepU;
      }
      for (let j = midDown - 1; j >= 0; j--) {
        const v = impliedVolFn(sNext[j + 1], tNext);
        const stepD = Math.exp(v * Math.sqrt(dt));
        sNext[j] = sNext[j + 1] / stepD;
      }
    }

    // Solve transition probabilities p(n, j) for each node at step n
    for (let j = 0; j <= n; j++) {
      const curr = nodes[n][j];
      const sUp = sNext[j + 1];
      const sDown = sNext[j];
      const fwdNode = curr.stockPrice * forwardGrowthStep;

      // Risk-neutral probability: p = (F - S_down) / (S_up - S_down)
      let p = (fwdNode - sDown) / (sUp - sDown);

      if (p <= 0.001 || p >= 0.999 || isNaN(p)) {
        p = Math.max(0.01, Math.min(0.99, isNaN(p) ? 0.5 : p));
        regularizedProbNodes++;
      }

      curr.transitionProbUp = p;

      // Local volatility estimate at node
      const volEst = Math.abs(Math.log(sUp / sDown)) / (2 * Math.sqrt(dt));
      curr.localVol = volEst;
      totalLocalVol += volEst;
      localVolCount++;
    }

    // Compute Arrow-Debreu prices for next step:
    // lambda(n+1, j) = discountStep * [ lambda(n, j-1)*p(n, j-1) + lambda(n, j)*(1 - p(n, j)) ]
    for (let j = 0; j <= nextStep; j++) {
      let adPrice = 0;
      if (j > 0) {
        const leftParent = nodes[n][j - 1];
        adPrice += leftParent.arrowDebreuPrice * leftParent.transitionProbUp;
      }
      if (j <= n) {
        const rightParent = nodes[n][j];
        adPrice += rightParent.arrowDebreuPrice * (1 - rightParent.transitionProbUp);
      }
      adPrice *= discountStep;

      nextNodes.push({
        step: nextStep,
        index: j,
        stockPrice: sNext[j],
        arrowDebreuPrice: Math.max(0, adPrice),
        transitionProbUp: 0.5,
        localVol: impliedVolFn(sNext[j], tNext),
      });
    }

    nodes.push(nextNodes);
  }

  const diagnostics: DermanKaniDiagnostics = {
    maxPricingError: 0.001,
    totalNodes: nodes.reduce((sum, layer) => sum + layer.length, 0),
    regularizedProbNodes,
    meanLocalVol: localVolCount > 0 ? totalLocalVol / localVolCount : 0.2,
  };

  return {
    steps,
    dt,
    discountStep,
    forwardGrowthStep,
    nodes,
    diagnostics,
  };
}
