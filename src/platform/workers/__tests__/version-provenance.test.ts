/**
 * Unit tests for /api/version and getPaperTradingStatus build-time provenance fallback.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { handleVersion } from '../api/version';
import {
  getPaperTradingStatus,
  stopPaperTrading,
  __resetPaperTradingLoop,
} from '../paper-trading-entry';

describe('Worker Version Provenance (/api/version & getPaperTradingStatus)', () => {
  const dummyKv = {} as unknown as KVNamespace;

  beforeEach(() => {
    stopPaperTrading();
    __resetPaperTradingLoop();
    delete process.env.COMMIT_SHA;
    delete process.env.BUILD_COMMIT_SHA;
    delete process.env.SRC_TREE_HASH;
  });

  it('prefers runtime COMMIT_SHA and reports provenanceSource=env_secret', async () => {
    const res = handleVersion({
      CACHE: dummyKv,
      COMMIT_SHA: '04ed0660e7866b8cce331eb127eb5a227a8b1907',
      BUILD_COMMIT_SHA: '0996c20cc144049bc8e49ccbb1a81d1d4a7f1048',
      SRC_TREE_HASH: '352beccd9f1eed5e65e0ca354fa020774e899fbf',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      sha: '04ed0660e7866b8cce331eb127eb5a227a8b1907',
      shortSha: '04ed0660',
      srcTreeHash: '352beccd9f1eed5e65e0ca354fa020774e899fbf',
      provenanceSource: 'env_secret',
      service: 'algo-trader',
      arch: 'cf-only',
    });
  });

  it('falls back to BUILD_COMMIT_SHA and reports provenanceSource=build_embedded when COMMIT_SHA is unset', async () => {
    const res = handleVersion({
      CACHE: dummyKv,
      BUILD_COMMIT_SHA: '0996c20cc144049bc8e49ccbb1a81d1d4a7f1048',
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      sha: '0996c20cc144049bc8e49ccbb1a81d1d4a7f1048',
      shortSha: '0996c20c',
      provenanceSource: 'build_embedded',
      service: 'algo-trader',
      arch: 'cf-only',
    });
  });

  it('reports provenanceSource=unknown when neither COMMIT_SHA nor BUILD_COMMIT_SHA is set', async () => {
    const res = handleVersion({ CACHE: dummyKv });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sha).toBe('unknown');
    expect(body.shortSha).toBe('unknown');
    expect(body.provenanceSource).toBe('unknown');
  });

  it('falls back to BUILD_COMMIT_SHA and includes srcTreeHash in getPaperTradingStatus when provided', async () => {
    const status = await getPaperTradingStatus(undefined, {
      PAPER_TRADING_ENABLED: 'true',
      QWEN_KILL: '0',
      BUILD_COMMIT_SHA: '04ed0660e7866b8cce331eb127eb5a227a8b1907',
      SRC_TREE_HASH: '352beccd9f1eed5e65e0ca354fa020774e899fbf',
      ENVIRONMENT: 'staging',
    });
    expect(status.versionIdentity).toEqual({
      commitSha: '04ed0660e7866b8cce331eb127eb5a227a8b1907',
      shortSha: '04ed0660',
      deployedAt: null,
      deployBranch: null,
      environment: 'staging',
      srcTreeHash: '352beccd9f1eed5e65e0ca354fa020774e899fbf',
    });
  });
});
