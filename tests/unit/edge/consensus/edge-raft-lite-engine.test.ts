import { describe, it, expect } from 'vitest';
import { EdgeRaftLiteEngine, mergeClocks, createInitialClock } from '../../../../src/edge/consensus/edge-raft-lite-engine';
import type { RaftMessage } from '../../../../src/edge/consensus/edge-raft-lite-types';

describe('EdgeRaftLiteEngine Comprehensive Branch Coverage', () => {
  it('handles clock creation and merging', () => {
    const c1 = createInitialClock();
    const c2 = { nrt: 2, sin: 5, fra: 1 };
    const merged = mergeClocks(c1, c2);
    expect(merged).toEqual({ nrt: 2, sin: 5, fra: 1 });
  });

  it('rejects proposal when not leader or lease is expired', () => {
    const engine = new EdgeRaftLiteEngine<string>({ regionId: 'sin', leaseDurationMs: 1000, quorumSize: 2 });

    // Non-leader propose
    const res1 = engine.propose('key1', 'val1');
    expect(res1.success).toBe(false);
    expect(res1.reason).toContain('Not leader');

    // Become leader via election
    engine.startElection(1000);
    engine.handleVoteResponse('nrt', 1, true, 1000);
    expect(engine.getState().role).toBe('leader');

    // Propose with valid lease
    const res2 = engine.propose('key1', 'val1', 1200);
    expect(res2.success).toBe(true);
    expect(engine.getStoreValue('key1')).toBe('val1');

    // Propose with expired lease (> 1000 + 1000 = 2000)
    const res3 = engine.propose('key2', 'val2', 2500);
    expect(res3.success).toBe(false);
    expect(res3.reason).toBe('Leader lease expired');
  });

  it('throws when creating heartbeat as non-leader', () => {
    const engine = new EdgeRaftLiteEngine({ regionId: 'nrt' });
    expect(() => engine.createHeartbeat()).toThrow('cannot emit heartbeat in role follower');
  });

  it('handles heartbeat validation and term transitions', () => {
    const engine = new EdgeRaftLiteEngine({ regionId: 'fra' });

    // Lower term heartbeat is rejected
    const staleMsg: RaftMessage<unknown> = {
      type: 'HEARTBEAT',
      term: -1,
      senderId: 'nrt',
      vectorClock: { nrt: 1, sin: 0, fra: 0 },
    };
    expect(engine.handleHeartbeat(staleMsg).success).toBe(false);

    // Higher term heartbeat updates term and state
    const validMsg: RaftMessage<unknown> = {
      type: 'HEARTBEAT',
      term: 5,
      senderId: 'sin',
      vectorClock: { nrt: 0, sin: 3, fra: 0 },
      leaseInfo: { leaderId: 'sin', grantedAtMs: 1000, expiresAtMs: 6000 },
    };
    const res = engine.handleHeartbeat(validMsg, 2000);
    expect(res.success).toBe(true);
    expect(res.term).toBe(5);
    expect(engine.getState().leaderId).toBe('sin');
    expect(engine.isLeaseValid(2000)).toBe(true);
  });

  it('handles vote requests and responses across roles', () => {
    const engine = new EdgeRaftLiteEngine({ regionId: 'nrt' });

    // Vote request with lower term
    const lowVote: RaftMessage<unknown> = {
      type: 'REQUEST_VOTE',
      term: -1,
      senderId: 'sin',
      vectorClock: { nrt: 0, sin: 1, fra: 0 },
    };
    expect(engine.handleVoteRequest(lowVote).voteGranted).toBe(false);

    // Vote request with higher term
    const highVote: RaftMessage<unknown> = {
      type: 'REQUEST_VOTE',
      term: 2,
      senderId: 'sin',
      vectorClock: { nrt: 0, sin: 2, fra: 0 },
    };
    expect(engine.handleVoteRequest(highVote).voteGranted).toBe(true);

    // Candidate handling vote response from wrong term or not candidate
    const followerRes = engine.handleVoteResponse('sin', 2, true);
    expect(followerRes).toBe(false);

    engine.startElection();
    const wrongTermRes = engine.handleVoteResponse('sin', 99, true);
    expect(wrongTermRes).toBe(false);
  });

  it('handles commit messages with payload validation', () => {
    const engine = new EdgeRaftLiteEngine<string>({ regionId: 'sin' });

    // Stale term commit
    const staleCommit: RaftMessage<string> = {
      type: 'COMMIT',
      term: -1,
      senderId: 'nrt',
      vectorClock: { nrt: 1, sin: 0, fra: 0 },
    };
    expect(engine.handleCommit(staleCommit).success).toBe(false);

    // Missing payload
    const emptyCommit: RaftMessage<string> = {
      type: 'COMMIT',
      term: 0,
      senderId: 'nrt',
      vectorClock: { nrt: 1, sin: 0, fra: 0 },
    };
    expect(engine.handleCommit(emptyCommit).success).toBe(false);

    // Valid commit
    const validCommit: RaftMessage<string> = {
      type: 'COMMIT',
      term: 0,
      senderId: 'nrt',
      payload: { key: 'alpha', value: 'omega', clock: { nrt: 2, sin: 0, fra: 0 } },
      vectorClock: { nrt: 2, sin: 0, fra: 0 },
    };
    const res = engine.handleCommit(validCommit);
    expect(res.success).toBe(true);
    expect(res.applied).toBe(true);
    expect(engine.getStoreValue('alpha')).toBe('omega');
  });
});
