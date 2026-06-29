import { describe, it, expect } from 'vitest';
import {
  sha256,
  buildChainRow,
  computeRowHash,
  verifyChain,
  CHAIN_GENESIS,
  type ChainRow,
} from '../dlp-hash-chain';

describe('sha256', () => {
  it('returns consistent hex string', () => {
    const h = sha256('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(sha256('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('buildChainRow', () => {
  const partial = {
    id: 'r1',
    subscriberId: 'sub-1',
    url: 'https://api.example.com',
    method: 'POST',
    action: 'allow',
    patternId: null,
    payloadHash: sha256('body'),
    ts: '2026-04-16T00:00:00.000Z',
  };

  it('sets prevHash and computes rowHash', () => {
    const row = buildChainRow(partial, CHAIN_GENESIS);
    expect(row.prevHash).toBe(CHAIN_GENESIS);
    expect(row.rowHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rowHash changes when prevHash changes', () => {
    const r1 = buildChainRow(partial, CHAIN_GENESIS);
    const r2 = buildChainRow(partial, 'different-prev');
    expect(r1.rowHash).not.toBe(r2.rowHash);
  });
});

describe('verifyChain', () => {
  function makeRow(id: string, prevHash: string): ChainRow {
    const partial = {
      id,
      subscriberId: 'sub-1',
      url: 'https://api.example.com',
      method: 'GET',
      action: 'allow',
      patternId: null,
      payloadHash: sha256(id),
      ts: `2026-04-16T00:00:0${id}.000Z`,
    };
    return buildChainRow(partial, prevHash);
  }

  it('accepts valid single-row chain', () => {
    const r = makeRow('0', CHAIN_GENESIS);
    expect(verifyChain([r])).toEqual({ valid: true });
  });

  it('accepts valid multi-row chain', () => {
    const r0 = makeRow('0', CHAIN_GENESIS);
    const r1 = makeRow('1', r0.rowHash);
    const r2 = makeRow('2', r1.rowHash);
    expect(verifyChain([r0, r1, r2])).toEqual({ valid: true });
  });

  it('detects tampered rowHash', () => {
    const r0 = makeRow('0', CHAIN_GENESIS);
    const tampered = { ...r0, rowHash: 'deadbeef' };
    expect(verifyChain([tampered])).toEqual({ valid: false, brokenAt: 0 });
  });

  it('detects broken prevHash link', () => {
    const r0 = makeRow('0', CHAIN_GENESIS);
    const r1 = makeRow('1', r0.rowHash);
    // Insert row with wrong prevHash between r0 and r1
    const bad = { ...r1, prevHash: 'wrong' };
    expect(verifyChain([r0, bad])).toEqual({ valid: false, brokenAt: 1 });
  });

  it('detects tampered action field', () => {
    const r0 = makeRow('0', CHAIN_GENESIS);
    const tampered = { ...r0, action: 'block' }; // changed but rowHash not updated
    expect(verifyChain([tampered])).toEqual({ valid: false, brokenAt: 0 });
  });

  it('accepts empty chain', () => {
    expect(verifyChain([])).toEqual({ valid: true });
  });
});

describe('computeRowHash', () => {
  it('is deterministic', () => {
    const partial = {
      id: 'x',
      subscriberId: 's',
      url: 'u',
      method: 'POST',
      action: 'block',
      patternId: 'p-sk',
      payloadHash: sha256('payload'),
      prevHash: 'prev',
      ts: '2026-01-01T00:00:00.000Z',
    };
    expect(computeRowHash(partial)).toBe(computeRowHash(partial));
  });
});
