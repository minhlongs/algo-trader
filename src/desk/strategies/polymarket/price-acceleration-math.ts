/**
 * Price Acceleration V2 — Pure Velocity & Acceleration Math Helpers
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface PriceAccelerationConfig extends BaseStrategyConfig {
  velocityWindow: number;
  accelerationWindow: number;
  accelerationThreshold: number;
  minVelocity: number;
}

export const DEFAULT_CONFIG: PriceAccelerationConfig = {
  velocityWindow: 5,
  accelerationWindow: 3,
  accelerationThreshold: 0.001,
  minVelocity: 0.003,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 12 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

export function calcVelocity(prices: number[], window: number): number {
  if (prices.length < window + 1 || window <= 0) return 0;
  const end = prices[prices.length - 1];
  const start = prices[prices.length - 1 - window];
  return (end - start) / window;
}

export function calcAcceleration(velocities: number[]): number {
  if (velocities.length < 2) return 0;
  return (velocities[velocities.length - 1] - velocities[0]) / velocities.length;
}

export function isAccelerationSignal(
  accel: number,
  velocity: number,
  config: Pick<PriceAccelerationConfig, 'accelerationThreshold' | 'minVelocity'>,
): boolean {
  return Math.abs(accel) > config.accelerationThreshold && Math.abs(velocity) > config.minVelocity;
}

export function determineDirection(velocity: number): 'yes' | 'no' | null {
  if (velocity > 0) return 'yes';
  if (velocity < 0) return 'no';
  return null;
}
