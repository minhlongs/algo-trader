/**
 * File storage persistence helpers for trial drip scheduler state.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type SchedulerState, type DripSubscriber } from './trial-drip-types';

export const DRIP_DATA_DIR = join(process.cwd(), 'data', 'drip');
export const SCHEDULER_FILE = join(DRIP_DATA_DIR, 'scheduler.json');

export function ensureDripDir(): void {
  if (!existsSync(DRIP_DATA_DIR)) mkdirSync(DRIP_DATA_DIR, { recursive: true });
}

export function loadSchedulerState(): SchedulerState {
  ensureDripDir();
  try {
    const raw = readFileSync(SCHEDULER_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { subscribers: {}, autoRunPending: false };
  }
}

export function saveSchedulerState(state: SchedulerState): void {
  ensureDripDir();
  writeFileSync(SCHEDULER_FILE, JSON.stringify(state, null, 2));
}

export function buildSchedulerSnapshot(
  subscribers: Map<string, DripSubscriber>,
  autoRunPending: boolean,
): SchedulerState {
  if (subscribers.size === 0) {
    return { subscribers: {}, autoRunPending: false };
  }
  const snapshot: SchedulerState = { subscribers: {}, autoRunPending };
  for (const [tid, sub] of subscribers) {
    snapshot.subscribers[tid] = {
      email: sub.email,
      tier: sub.tier,
      subscribedAt: sub.subscribedAt,
      trialEndsAt: sub.trialEndsAt,
      lastEmailDay: sub.lastEmailDay,
      isActive: sub.isActive,
    };
  }
  return snapshot;
}

export function rebuildSubscribers(
  state: SchedulerState,
  subscribers: Map<string, DripSubscriber>,
): boolean {
  if (subscribers.size === 0 && Object.keys(state.subscribers).length > 0) {
    for (const [tid, sub] of Object.entries(state.subscribers)) {
      subscribers.set(tid, { ...sub, tenantId: tid, daysSinceTrialStart: 0 });
    }
    return state.autoRunPending;
  }
  return false;
}
