/**
 * Order arrival intensity and fill probability models for MARL market-making.
 * Implements Poisson arrival intensity lambda(delta) = A * exp(-kappa * delta),
 * fill probability over discrete time steps, and queue position modeling.
 */

export interface ArrivalIntensityParams {
  baselineArrivalRate: number; // A: orders per unit time at the mid (delta = 0)
  kappa: number;               // Order book decay / price sensitivity parameter
}

export interface FillProbabilityParams extends ArrivalIntensityParams {
  spreadDistance: number;      // delta = |price - midPrice|
  timeDeltaSec: number;        // delta_t: simulation time step duration in seconds
  queueAhead?: number;         // Volume of resting orders ahead in the FIFO queue
  typicalLevelVolume?: number; // Characteristic volume per book level
}

/**
 * Calculates instantaneous Poisson arrival intensity:
 * lambda(delta) = A * exp(-kappa * delta)
 */
export function calculateArrivalIntensity(
  spreadDistance: number,
  params: ArrivalIntensityParams,
): number {
  const { baselineArrivalRate, kappa } = params;
  if (baselineArrivalRate <= 0) return 0;
  const delta = Math.max(0, spreadDistance);
  return baselineArrivalRate * Math.exp(-kappa * delta);
}

/**
 * Calculates fill probability over time interval dt:
 * P(fill | delta, dt) = 1 - exp(-lambda(delta) * dt)
 * If queueAhead is provided, scales probability by queue clearance factor.
 */
export function calculateFillProbability(params: FillProbabilityParams): number {
  const {
    spreadDistance,
    baselineArrivalRate,
    kappa,
    timeDeltaSec,
    queueAhead = 0,
    typicalLevelVolume = 100,
  } = params;

  if (timeDeltaSec <= 0 || baselineArrivalRate <= 0) return 0;

  const lambda = calculateArrivalIntensity(spreadDistance, { baselineArrivalRate, kappa });
  const rawProb = 1 - Math.exp(-lambda * timeDeltaSec);

  if (queueAhead <= 0) {
    return Math.min(1, Math.max(0, rawProb));
  }

  // Queue priority attenuation: orders deeper in FIFO queue have reduced instantaneous fill rate
  const queueFactor = 1 / (1 + queueAhead / Math.max(1, typicalLevelVolume));
  return Math.min(1, Math.max(0, rawProb * queueFactor));
}

/**
 * Calculates expected time to fill for a quote placed at spread distance delta:
 * E[T] = 1 / lambda(delta)
 */
export function calculateExpectedFillTime(
  spreadDistance: number,
  params: ArrivalIntensityParams,
): number {
  const lambda = calculateArrivalIntensity(spreadDistance, params);
  if (lambda <= 0) return Number.POSITIVE_INFINITY;
  return 1 / lambda;
}

/**
 * Simulates a stochastic fill event for a quote given its parameters and a random roll [0, 1).
 */
export function simulateFillEvent(
  params: FillProbabilityParams,
  randomUniform: number = Math.random(),
): boolean {
  const prob = calculateFillProbability(params);
  return randomUniform < prob;
}
