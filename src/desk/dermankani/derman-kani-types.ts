/**
2 * Derman-Kani (1994) Implied Volatility Local Tree Model Types
3 *
4 * References:
5 * Derman, E., & Kani, I. (1994). Riding on a Smile. RISK, 7(2), 32-39.
6 * Derman, E., & Kani, I. (1994). The Volatility Smile and Its Implied Tree.
7 * Quantitative Strategies Research Notes, Goldman Sachs.
8 *
9 * @module desk/dermankani/derman-kani-types
10 */

export interface DermanKaniConfig {
  /** Spot price S0 > 0 */
  spot: number;
  /** Risk-free continuously compounded interest rate r >= 0 */
  rate: number;
  /** Continuous dividend or foreign rate q >= 0 */
  dividendYield: number;
  /** Time to maturity in years T > 0 */
  timeToMaturity: number;
  /** Number of discrete tree steps N >= 2 */
  steps: number;
  /** Black-Scholes implied volatility function sigma(K, t) */
  impliedVolFn: (strike: number, time: number) => number;
}

export interface DermanKaniNode {
  /** Node level / time step index i */
  step: number;
  /** Node position index j at step i (0 <= j <= i) */
  index: number;
  /** Underlying asset price S(i, j) */
  stockPrice: number;
  /** Arrow-Debreu state price lambda(i, j) */
  arrowDebreuPrice: number;
  /** Risk-neutral transition probability up p(i, j) */
  transitionProbUp: number;
  /** Local volatility estimated at this lattice node */
  localVol?: number;
}

export interface DermanKaniTree {
  /** Number of steps */
  steps: number;
  /** Time step dt = T / N */
  dt: number;
  /** Forward discount factor per step exp(-r * dt) */
  discountStep: number;
  /** Forward growth factor per step exp((r - q) * dt) */
  forwardGrowthStep: number;
  /** 2D grid of tree nodes: nodes[step][index] */
  nodes: DermanKaniNode[][];
  /** Calibration diagnostics */
  diagnostics: DermanKaniDiagnostics;
}

export interface DermanKaniDiagnostics {
  /** Maximum deviation between calibrated Arrow-Debreu implied options and market options */
  maxPricingError: number;
  /** Total number of tree nodes calibrated */
  totalNodes: number;
  /** Number of nodes where probability adjustment / fallback was needed */
  regularizedProbNodes: number;
  /** Mean absolute local volatility across tree */
  meanLocalVol: number;
}

export interface TreeOptionPricingInput {
  /** Option type: call or put */
  optionType: 'call' | 'put';
  /** Exercise style: european or american */
  exerciseStyle: 'european' | 'american';
  /** Strike price K > 0 */
  strike: number;
}

export interface TreeOptionPricingResult {
  /** Option price at root node */
  price: number;
  /** Delta hedge ratio at root (S1,1 - S1,0) */
  delta: number;
  /** Gamma at root */
  gamma: number;
  /** Theta (time decay) estimated from tree step */
  theta: number;
  /** Early exercise premium (American - European price) */
  earlyExercisePremium: number;
}
