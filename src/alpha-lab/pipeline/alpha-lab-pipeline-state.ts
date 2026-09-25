/**
 * Alpha-Lab Autonomous Pipeline State Management
 */

import type { DiscoveredAlphaCandidate } from '../alpha-discovery/continuous-discovery-pipeline';
import type { AlphaLifecycleStateMachine } from '../attribution/alpha-lifecycle-state-machine';

export class PipelineStateManager {
  public readonly stateMachines = new Map<string, AlphaLifecycleStateMachine>();
  public readonly candidateConfigs = new Map<string, Record<string, unknown>>();
  public readonly lastKnownCandidates = new Map<string, DiscoveredAlphaCandidate>();

  public isRunning = false;
  public cycleCount = 0;
  public lastCycleAt: string | null = null;
  public ledgerQueue: Promise<void> = Promise.resolve();

  public reset(): void {
    this.stateMachines.clear();
    this.candidateConfigs.clear();
    this.lastKnownCandidates.clear();
    this.cycleCount = 0;
    this.lastCycleAt = null;
    this.isRunning = false;
  }

  public incrementCycle(): number {
    this.cycleCount++;
    return this.cycleCount;
  }

  public setLastCycleAt(timestamp: string): void {
    this.lastCycleAt = timestamp;
  }
}
