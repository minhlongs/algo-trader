import { describe, it, expect, beforeEach } from 'vitest';
import {
  EdgeRaftLiteEngine,
  mergeClocks,
  createInitialClock,
} from '../../../../src/edge/consensus/edge-raft-lite-engine';

describe('EdgeRaftLiteEngine Unit Tests', () => {
  let nodeNrt: EdgeRaftLiteEngine<string>;
  let nodeSin: EdgeRaftLiteEngine<string>;
  let nodeFra: EdgeRaftLiteEngine<string>;

  beforeEach(() => {
    nodeNrt = new EdgeRaftLiteEngine<string>({ regionId: 'nrt', leaseDurationMs: 3000, quorumSize: 2 });
    nodeSin = new EdgeRaftLiteEngine<string>({ regionId: 'sin', leaseDurationMs: 3000, quorumSize: 2 });
    nodeFra = new EdgeRaftLiteEngine<string>({ regionId: 'fra', leaseDurationMs: 3000, quorumSize: 2 });
  });

  it('should initialize with follower state and empty clock', () => {
    const state = nodeNrt.getState();
    expect(state.regionId).toBe('nrt');
    expect(state.role).toBe('follower');
    expect(state.currentTerm).toBe(0);
    expect(state.leaderId).toBeNull();
    expect(state.clock).toEqual({ nrt: 0, sin: 0, fra: 0 });
    expect(nodeNrt.isLeaseValid()).toBe(false);
  });

  it('should merge vector clocks correctly', () => {
    const c1 = { nrt: 1, sin: 3, fra: 0 };
    const c2 = { nrt: 2, sin: 1, fra: 5 };
    const merged = mergeClocks(c1, c2);
    expect(merged).toEqual({ nrt: 2, sin: 3, fra: 5 });
  });

  it('should successfully elect leader with 2/3 quorum', () => {
    const now = 10000;
    const election = nodeNrt.startElection(now);
    expect(election.term).toBe(1);
    expect(election.messages.length).toBe(2);

    const voteReq = election.messages[0];
    const sinVote = nodeSin.handleVoteRequest(voteReq);
    expect(sinVote.voteGranted).toBe(true);

    const becameLeader = nodeNrt.handleVoteResponse('sin', 1, sinVote.voteGranted, now);
    expect(becameLeader).toBe(true);
    expect(nodeNrt.getState().role).toBe('leader');
    expect(nodeNrt.getState().leaderId).toBe('nrt');
    expect(nodeNrt.isLeaseValid(now + 1000)).toBe(true);
    expect(nodeNrt.isLeaseValid(now + 4000)).toBe(false);
  });

  it('should distribute heartbeats and renew lease', () => {
    const now = 10000;
    nodeNrt.startElection(now);
    nodeNrt.handleVoteResponse('sin', 1, true, now);

    const heartbeat = nodeNrt.createHeartbeat(now + 500);
    expect(heartbeat.type).toBe('HEARTBEAT');
    expect(heartbeat.senderId).toBe('nrt');

    const resultSin = nodeSin.handleHeartbeat(heartbeat, now + 500);
    expect(resultSin.success).toBe(true);
    expect(nodeSin.getState().leaderId).toBe('nrt');
  });

  it('should reject propose when not leader', () => {
    const prop = nodeSin.propose('btc_rate', '70000');
    expect(prop.success).toBe(false);
    expect(prop.reason).toContain('Not leader');
  });

  it('should commit state across cluster with vector clock tracking', () => {
    const now = 10000;
    nodeNrt.startElection(now);
    nodeNrt.handleVoteResponse('sin', 1, true, now);

    const prop = nodeNrt.propose('usdc_balance', '1000000', now + 100);
    expect(prop.success).toBe(true);
    expect(prop.message).toBeDefined();
    expect(nodeNrt.getStoreValue('usdc_balance')).toBe('1000000');

    if (prop.message) {
      const commitSin = nodeSin.handleCommit(prop.message);
      const commitFra = nodeFra.handleCommit(prop.message);
      expect(commitSin.applied).toBe(true);
      expect(commitFra.applied).toBe(true);
      expect(nodeSin.getStoreValue('usdc_balance')).toBe('1000000');
      expect(nodeFra.getStoreValue('usdc_balance')).toBe('1000000');
    }
  });
});
