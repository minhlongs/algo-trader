/**
 * Alpha Lifecycle State Machine Persistence & Snapshot Utilities
 *
 * Provides serialization and deserialization for AlphaLifecycleStateMachine,
 * ensuring all 6 canonical states and transition histories are safely restored.
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import {
  AlphaLifecycleStateMachine,
  type AlphaLifecycleState,
  type PromotionStateTransition,
} from './alpha-lifecycle-state-machine';

export interface LifecycleStateMachineSnapshot {
  strategyId: string;
  state: AlphaLifecycleState;
  history: PromotionStateTransition[];
  version: number;
  savedAt: number;
}

const CANONICAL_STATES: readonly AlphaLifecycleState[] = [
  'DISCOVERED',
  'VALIDATED',
  'PAPER_ACTIVE',
  'PROMOTED_LIVE_ELIGIBLE',
  'QUARANTINED',
  'RETIRED',
];

export function isValidLifecycleState(state: unknown): state is AlphaLifecycleState {
  return typeof state === 'string' && CANONICAL_STATES.includes(state as AlphaLifecycleState);
}

export function serializeStateMachine(machine: AlphaLifecycleStateMachine): LifecycleStateMachineSnapshot {
  return {
    strategyId: machine.getStrategyId(),
    state: machine.getState(),
    history: machine.getHistory(),
    version: 1,
    savedAt: Date.now(),
  };
}

export function deserializeStateMachine(snapshot: LifecycleStateMachineSnapshot): AlphaLifecycleStateMachine {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid snapshot: expected a valid object');
  }
  if (typeof snapshot.strategyId !== 'string' || snapshot.strategyId.trim() === '') {
    throw new Error('Invalid snapshot: missing or invalid strategyId');
  }
  if (!isValidLifecycleState(snapshot.state)) {
    throw new Error(`Invalid snapshot: unknown lifecycle state "${String(snapshot.state)}"`);
  }

  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  return new AlphaLifecycleStateMachine(snapshot.strategyId, snapshot.state, history);
}

export function serializeStateMachineToJson(machine: AlphaLifecycleStateMachine, pretty = false): string {
  const snapshot = serializeStateMachine(machine);
  return pretty ? JSON.stringify(snapshot, null, 2) : JSON.stringify(snapshot);
}

export function deserializeStateMachineFromJson(json: string): AlphaLifecycleStateMachine {
  try {
    const parsed = JSON.parse(json) as LifecycleStateMachineSnapshot;
    return deserializeStateMachine(parsed);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid snapshot:')) {
      throw err;
    }
    throw new Error(`Failed to deserialize state machine from JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function serializeStateMachines(
  machines: Map<string, AlphaLifecycleStateMachine>,
): Record<string, LifecycleStateMachineSnapshot> {
  const result: Record<string, LifecycleStateMachineSnapshot> = {};
  for (const [id, machine] of machines.entries()) {
    result[id] = serializeStateMachine(machine);
  }
  return result;
}

export function deserializeStateMachines(
  snapshots: Record<string, LifecycleStateMachineSnapshot>,
): Map<string, AlphaLifecycleStateMachine> {
  const map = new Map<string, AlphaLifecycleStateMachine>();
  if (!snapshots || typeof snapshots !== 'object') {
    return map;
  }
  for (const [id, snapshot] of Object.entries(snapshots)) {
    map.set(id, deserializeStateMachine(snapshot));
  }
  return map;
}

export async function saveStateMachineToFile(machine: AlphaLifecycleStateMachine, filePath: string): Promise<void> {
  const json = serializeStateMachineToJson(machine, true);
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, json, 'utf-8');
}

export async function loadStateMachineFromFile(filePath: string): Promise<AlphaLifecycleStateMachine> {
  const content = await fs.readFile(filePath, 'utf-8');
  return deserializeStateMachineFromJson(content);
}
