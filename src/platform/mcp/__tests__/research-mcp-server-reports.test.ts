/**
 * Research MCP Server — Alpha Report Handler Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { __setGate } from '../../middleware/signal-tier-resolver';
import { handleGetAlphaReport } from '../research-mcp-server';

const { paths } = vi.hoisted(() => ({
  paths: { alphaReports: '' },
}));

vi.mock('../../../alpha-lab/provenance/alpha-report-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../alpha-lab/provenance/alpha-report-store')>();
  return {
    ...actual,
    readAlphaReportByCandidateId: (id: string, root?: string) =>
      actual.readAlphaReportByCandidateId(id, root ?? paths.alphaReports),
  };
});

function fakeLicense(tier: string, userId = 'user-1') {
  return { id: 'lic-1', userId, tier, active: true };
}
const PRO_GATE = { validateApiKey: (k: string) => (k ? fakeLicense('PRO') : undefined) };

let ledgerDir: string;
beforeEach(async () => {
  ledgerDir = await mkdtemp(join(tmpdir(), 'research-mcp-rep-'));
  paths.alphaReports = join(ledgerDir, 'alpha-reports');
});
afterEach(async () => {
  await rm(ledgerDir, { recursive: true, force: true });
});

describe('handleGetAlphaReport', () => {
  it('returns isError when apiKey is missing', async () => {
    const result = await handleGetAlphaReport({ apiKey: '', candidateId: 'c1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns isError when candidateId is missing', async () => {
    const result = await handleGetAlphaReport({ apiKey: 'k', candidateId: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns unauthorized for invalid key', async () => {
    __setGate({ validateApiKey: () => undefined });
    try {
      const result = await handleGetAlphaReport({ apiKey: 'bad', candidateId: 'c1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unauthorized');
    } finally {
      __setGate(null);
    }
  });

  it('returns not-found shape for PRO tier when alpha report does not exist', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetAlphaReport({ apiKey: 'pro', candidateId: 'c-42' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.candidateId).toBe('c-42');
      expect(parsed.found).toBe(false);
      expect(parsed.message).toContain('Alpha report not found');
    } finally {
      __setGate(null);
    }
  });

  it('returns the alpha report when found in the store', async () => {
    __setGate(PRO_GATE);
    try {
      const verdict = { passed: true, failedCriteria: [], comparisons: [], recommendation: 'PASS' };
      await mkdir(paths.alphaReports, { recursive: true });
      await writeFile(
        join(paths.alphaReports, 'candidate-ok.json'),
        JSON.stringify({ candidateId: 'candidate-ok', verdict, createdAt: '2026-03-01T00:00:00Z' }),
      );

      const result = await handleGetAlphaReport({ apiKey: 'pro', candidateId: 'candidate-ok' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.candidateId).toBe('candidate-ok');
      expect(parsed.verdict.passed).toBe(true);
      expect(parsed.createdAt).toBe('2026-03-01T00:00:00Z');
    } finally {
      __setGate(null);
    }
  });
});
