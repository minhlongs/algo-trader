import {
  RegionId,
  RaftNodeRole,
  VectorClock,
  LeaseInfo,
  RaftMessage,
  RaftLiteState,
  EngineConfig,
} from './edge-raft-lite-types';

export const ALL_REGIONS: readonly RegionId[] = ['nrt', 'sin', 'fra'] as const;

export function createInitialClock(): VectorClock {
  return { nrt: 0, sin: 0, fra: 0 };
}

export function mergeClocks(a: VectorClock, b: VectorClock): VectorClock {
  return {
    nrt: Math.max(a.nrt, b.nrt),
    sin: Math.max(a.sin, b.sin),
    fra: Math.max(a.fra, b.fra),
  };
}

export class EdgeRaftLiteEngine<T = unknown> {
  private readonly regionId: RegionId;
  private readonly leaseDurationMs: number;
  private readonly quorumSize: number;
  private currentTerm = 0;
  private role: RaftNodeRole = 'follower';
  private leaderId: RegionId | null = null;
  private activeLease: LeaseInfo | null = null;
  private clock: VectorClock = createInitialClock();
  private store: Record<string, T> = {};
  private votesReceived = new Set<RegionId>();
  private uncommittedLogs: Array<{ term: number; key: string; value: T; clock: VectorClock }> = [];

  constructor(config: EngineConfig) {
    this.regionId = config.regionId;
    this.leaseDurationMs = config.leaseDurationMs ?? 5000;
    this.quorumSize = config.quorumSize ?? 2;
  }

  public getState(): RaftLiteState<T> {
    return {
      regionId: this.regionId,
      currentTerm: this.currentTerm,
      role: this.role,
      leaderId: this.leaderId,
      activeLease: this.activeLease ? { ...this.activeLease } : null,
      clock: { ...this.clock },
      store: { ...this.store },
      uncommittedLogs: [...this.uncommittedLogs],
    };
  }

  public isLeaseValid(nowMs = Date.now()): boolean {
    if (!this.activeLease) return false;
    return nowMs < this.activeLease.expiresAtMs;
  }

  public startElection(nowMs = Date.now()): { term: number; messages: RaftMessage<T>[] } {
    this.currentTerm += 1;
    this.role = 'candidate';
    this.leaderId = null;
    this.votesReceived = new Set<RegionId>([this.regionId]);
    this.clock[this.regionId] += 1;

    const messages: RaftMessage<T>[] = ALL_REGIONS
      .filter((r) => r !== this.regionId)
      .map((target) => ({
        type: 'REQUEST_VOTE',
        term: this.currentTerm,
        senderId: this.regionId,
        vectorClock: { ...this.clock },
      }));

    if (this.votesReceived.size >= this.quorumSize) {
      this.promoteToLeader(nowMs);
    }
    return { term: this.currentTerm, messages };
  }

  public handleVoteRequest(msg: RaftMessage<T>): { voteGranted: boolean; term: number } {
    if (msg.term > this.currentTerm) {
      this.currentTerm = msg.term;
      this.role = 'follower';
      this.leaderId = null;
    }
    this.clock = mergeClocks(this.clock, msg.vectorClock);

    const isTermValid = msg.term >= this.currentTerm;
    const canVote = isTermValid && (this.role === 'follower' || this.leaderId === null);
    return { voteGranted: canVote, term: this.currentTerm };
  }

  public handleVoteResponse(voterId: RegionId, term: number, granted: boolean, nowMs = Date.now()): boolean {
    if (term !== this.currentTerm || this.role !== 'candidate') return false;
    if (granted) {
      this.votesReceived.add(voterId);
      if (this.votesReceived.size >= this.quorumSize) {
        this.promoteToLeader(nowMs);
        return true;
      }
    }
    return false;
  }

  public createHeartbeat(nowMs = Date.now()): RaftMessage<T> {
    if (this.role !== 'leader') {
      throw new Error(`Node ${this.regionId} cannot emit heartbeat in role ${this.role}`);
    }
    this.clock[this.regionId] += 1;
    this.renewLease(nowMs);
    return {
      type: 'HEARTBEAT',
      term: this.currentTerm,
      senderId: this.regionId,
      vectorClock: { ...this.clock },
      leaseInfo: this.activeLease ? { ...this.activeLease } : undefined,
    };
  }

  public handleHeartbeat(msg: RaftMessage<T>, nowMs = Date.now()): { success: boolean; term: number } {
    if (msg.term < this.currentTerm) {
      return { success: false, term: this.currentTerm };
    }
    if (msg.term > this.currentTerm || this.role !== 'follower') {
      this.currentTerm = msg.term;
      this.role = 'follower';
    }
    this.leaderId = msg.senderId;
    this.clock = mergeClocks(this.clock, msg.vectorClock);
    if (msg.leaseInfo) {
      this.activeLease = { ...msg.leaseInfo };
    }
    return { success: true, term: this.currentTerm };
  }

  public propose(
    key: string,
    value: T,
    nowMs = Date.now()
  ): { success: boolean; message?: RaftMessage<T>; reason?: string } {
    if (this.role !== 'leader') {
      return { success: false, reason: `Not leader (current role: ${this.role})` };
    }
    if (!this.isLeaseValid(nowMs)) {
      return { success: false, reason: 'Leader lease expired' };
    }
    this.clock[this.regionId] += 1;
    const logEntry = { term: this.currentTerm, key, value, clock: { ...this.clock } };
    this.uncommittedLogs.push(logEntry);

    const message: RaftMessage<T> = {
      type: 'COMMIT',
      term: this.currentTerm,
      senderId: this.regionId,
      payload: { key, value, clock: { ...this.clock } },
      vectorClock: { ...this.clock },
      leaseInfo: this.activeLease ? { ...this.activeLease } : undefined,
    };

    this.store[key] = value;
    return { success: true, message };
  }

  public handleCommit(msg: RaftMessage<T>): { success: boolean; applied: boolean } {
    if (msg.term < this.currentTerm) return { success: false, applied: false };
    if (!msg.payload) return { success: false, applied: false };

    this.clock = mergeClocks(this.clock, msg.vectorClock);
    this.store[msg.payload.key] = msg.payload.value;
    return { success: true, applied: true };
  }

  public getStoreValue(key: string): T | undefined {
    return this.store[key];
  }

  private promoteToLeader(nowMs: number): void {
    this.role = 'leader';
    this.leaderId = this.regionId;
    this.renewLease(nowMs);
  }

  private renewLease(nowMs: number): void {
    this.activeLease = {
      leaderId: this.regionId,
      term: this.currentTerm,
      grantedAtMs: nowMs,
      expiresAtMs: nowMs + this.leaseDurationMs,
      durationMs: this.leaseDurationMs,
    };
  }
}
