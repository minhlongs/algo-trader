import {
  ENGINE_IDS,
  EngineId,
  GuardAllocationResult,
} from './types';
import { logger } from '../../shared/utils/logger';

export interface CapitalBufferGuardOptions {
  readonly minCashBufferRatio?: number;
  readonly rebalanceDeadband?: number;
  readonly cooldownPeriodMs?: number;
}

export class CapitalBufferGuard {
  private minCashBufferRatio: number;
  private readonly deadband: number;
  private readonly cooldownMs: number;
  private lastRebalanceTimestamp = 0;

  constructor(options: CapitalBufferGuardOptions = {}) {
    this.minCashBufferRatio = options.minCashBufferRatio ?? 0.20;
    this.deadband = options.rebalanceDeadband ?? 0.03;
    this.cooldownMs = options.cooldownPeriodMs ?? 15 * 60 * 1000;
  }

  public applyGuard(
    totalNavUsd: number,
    targetWeights: Readonly<Record<EngineId, number>>,
    lockedCapital: Readonly<Record<EngineId, number>>
  ): GuardAllocationResult {
    const deployableCapitalUsd = Math.max(0, (1 - this.minCashBufferRatio) * totalNavUsd);
    const allocated: Partial<Record<EngineId, number>> = {};
    const drainModeEngines: EngineId[] = [];

    // Calculate baseline ideal dollar allocations
    const idealCapital: Partial<Record<EngineId, number>> = {};
    for (const id of ENGINE_IDS) {
      const weight = Math.max(0, targetWeights[id] ?? 0);
      idealCapital[id] = weight * deployableCapitalUsd;
    }

    // Step 1: Detect starvation and clamp allocations to at least lockedCapital
    let lockedDrainTotal = 0;
    const nonDrainEngines: EngineId[] = [];

    for (const id of ENGINE_IDS) {
      const ideal = idealCapital[id] ?? 0;
      const locked = Math.max(0, lockedCapital[id] ?? 0);

      if (ideal < locked) {
        allocated[id] = locked;
        drainModeEngines.push(id);
        lockedDrainTotal += locked;
      } else {
        nonDrainEngines.push(id);
      }
    }

    // Step 2: Distribute remaining deployable capital to non-drain engines
    const remainingDeployable = deployableCapitalUsd - lockedDrainTotal;

    if (remainingDeployable > 0 && nonDrainEngines.length > 0) {
      const nonDrainWeightSum = nonDrainEngines.reduce(
        (sum, id) => sum + (targetWeights[id] ?? 0),
        0
      );

      for (const id of nonDrainEngines) {
        const share =
          nonDrainWeightSum > 0
            ? (targetWeights[id] ?? 0) / nonDrainWeightSum
            : 1 / nonDrainEngines.length;
        const assigned = Math.max(
          lockedCapital[id] ?? 0,
          share * remainingDeployable
        );
        allocated[id] = assigned;
      }
    } else {
      // If remaining deployable is depleted, satisfy locked capital for all non-drain engines
      for (const id of nonDrainEngines) {
        allocated[id] = lockedCapital[id] ?? 0;
      }
    }

    // Calculate total allocated capital and unallocated cash
    let totalAllocated = 0;
    for (const id of ENGINE_IDS) {
      totalAllocated += allocated[id] ?? 0;
    }

    const unallocatedCashUsd = Math.max(0, totalNavUsd - totalAllocated);
    const cashBufferRatio = totalNavUsd > 0 ? unallocatedCashUsd / totalNavUsd : 1.0;

    if (cashBufferRatio < this.minCashBufferRatio - 1e-6) {
      logger.warn(
        `Cash buffer compressed below ${(this.minCashBufferRatio * 100).toFixed(1)}% due to locked positions: ${(cashBufferRatio * 100).toFixed(2)}%`
      );
    }

    const weights: Partial<Record<EngineId, number>> = {};
    for (const id of ENGINE_IDS) {
      weights[id] = totalNavUsd > 0 ? (allocated[id] ?? 0) / totalNavUsd : 0;
    }

    return {
      allocatedCapitalUsd: allocated as Record<EngineId, number>,
      unallocatedCashUsd,
      cashBufferRatio,
      isStarvationProtected: true,
      drainModeEngines,
    };
  }

  public checkDeadband(
    targetAllocated: Readonly<Record<EngineId, number>>,
    currentAllocated: Readonly<Record<EngineId, number>>
  ): { shouldRebalance: boolean; maxDriftPct: number } {
    let maxDriftPct = 0;

    for (const id of ENGINE_IDS) {
      const target = targetAllocated[id] ?? 0;
      const current = currentAllocated[id] ?? 0;
      const driftTarget = Math.abs(target - current) / Math.max(target, 1.0);
      const driftCurrent = Math.abs(target - current) / Math.max(current, 1.0);
      const drift = Math.max(driftTarget, driftCurrent);
      if (drift > maxDriftPct) {
        maxDriftPct = drift;
      }
    }

    return {
      shouldRebalance: maxDriftPct >= this.deadband - 1e-9,
      maxDriftPct,
    };
  }

  public checkCooldown(now = Date.now()): boolean {
    if (this.lastRebalanceTimestamp === 0) return true;
    return now - this.lastRebalanceTimestamp >= this.cooldownMs;
  }

  public recordRebalance(timestamp = Date.now()): void {
    this.lastRebalanceTimestamp = timestamp;
  }

  public setMinCashBufferRatio(ratio: number): void {
    if (ratio >= 0.20 && ratio <= 0.80) {
      this.minCashBufferRatio = ratio;
    }
  }
}

