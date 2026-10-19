import {
  RegionId,
  VectorClock,
  LeaseInfo,
  RaftMessage,
  RaftLiteState,
} from './edge-raft-lite-types';
import { ALL_REGIONS } from './edge-raft-lite-clock';

export function cloneRaftState<T>(state: RaftLiteState<T>): RaftLiteState<T> {
  return {
    regionId: state.regionId,
    currentTerm: state.currentTerm,
    role: state.role,
    leaderId: state.leaderId,
    activeLease: state.activeLease ? { ...state.activeLease } : null,
    clock: { ...state.clock },
    store: { ...state.store },
    uncommittedLogs: [...state.uncommittedLogs],
  };
}

export function isLeaseActive(lease: LeaseInfo | null, nowMs: number): boolean {
  if (!lease) return false;
  return nowMs < lease.expiresAtMs;
}

export function createLeaderLease(
  leaderId: RegionId,
  term: number,
  nowMs: number,
  leaseDurationMs: number
): LeaseInfo {
  return {
    leaderId,
    term,
    grantedAtMs: nowMs,
    expiresAtMs: nowMs + leaseDurationMs,
    durationMs: leaseDurationMs,
  };
}

export function buildVoteRequestMessages<T>(
  senderId: RegionId,
  term: number,
  clock: VectorClock
): RaftMessage<T>[] {
  return ALL_REGIONS
    .filter((r) => r !== senderId)
    .map(() => ({
      type: 'REQUEST_VOTE',
      term,
      senderId,
      vectorClock: { ...clock },
    }));
}

export function buildHeartbeatMessage<T>(
  senderId: RegionId,
  term: number,
  clock: VectorClock,
  activeLease: LeaseInfo | null
): RaftMessage<T> {
  return {
    type: 'HEARTBEAT',
    term,
    senderId,
    vectorClock: { ...clock },
    leaseInfo: activeLease ? { ...activeLease } : undefined,
  };
}

export function buildCommitMessage<T>(
  senderId: RegionId,
  term: number,
  key: string,
  value: T,
  clock: VectorClock,
  activeLease: LeaseInfo | null
): RaftMessage<T> {
  return {
    type: 'COMMIT',
    term,
    senderId,
    payload: { key, value, clock: { ...clock } },
    vectorClock: { ...clock },
    leaseInfo: activeLease ? { ...activeLease } : undefined,
  };
}
