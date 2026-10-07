export type RegionId = 'nrt' | 'sin' | 'fra';

export type RaftNodeRole = 'leader' | 'follower' | 'candidate';

export interface VectorClock {
  nrt: number;
  sin: number;
  fra: number;
}

export interface LeaseInfo {
  leaderId: RegionId;
  term: number;
  grantedAtMs: number;
  expiresAtMs: number;
  durationMs: number;
}

export interface RaftMessagePayload<T = unknown> {
  key: string;
  value: T;
  clock: VectorClock;
}

export interface RaftMessage<T = unknown> {
  type: 'HEARTBEAT' | 'PROPOSE' | 'COMMIT' | 'REQUEST_VOTE' | 'VOTE_RESPONSE';
  term: number;
  senderId: RegionId;
  payload?: RaftMessagePayload<T>;
  vectorClock: VectorClock;
  leaseInfo?: LeaseInfo;
}

export interface RaftLiteState<T = unknown> {
  regionId: RegionId;
  currentTerm: number;
  role: RaftNodeRole;
  leaderId: RegionId | null;
  activeLease: LeaseInfo | null;
  clock: VectorClock;
  store: Record<string, T>;
  uncommittedLogs: Array<{
    term: number;
    key: string;
    value: T;
    clock: VectorClock;
  }>;
}

export interface EngineConfig {
  regionId: RegionId;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  quorumSize?: number;
}
