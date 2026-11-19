import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mb-cli-')); roots.push(root);
  const ledger = join(root, 'ledger.jsonl'), checkpoint = join(root, 'head', 'independent.json');
  return { root, ledger, checkpoint, run: (...args: string[]) => spawnSync(process.execPath,
    ['--import', 'tsx', resolve('scripts/poly-market-blind-logger.ts'), '--ledger', ledger, '--checkpoint', checkpoint, ...args],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 }) };
}
describe('local market-blind logger CLI', () => {
  it('wires independent checkpoint, forecast metadata and approval-bound empirical status without market calls', () => {
    const f = fixture();
    const committed = f.run('commit', '--question-id', 'q1', '--raw-prob', '0.6', '--evidence', 'Official document.', '--model-version', 'model-v1',
      '--committed-at-ms', '1000', '--forecast-id', 'forecast-q1', '--research-question-id', 'research-q1', '--event-id', 'event-q1', '--market-id', 'market-q1',
      '--forecast-horizon-ms', '5000', '--provenance-kind', 'REAL', '--provenance-source', 'official-source', '--provenance-reference', 'publication-q1');
    expect(committed.error).toBeUndefined(); expect(committed.status, committed.stderr).toBe(0);
    const receipt = (JSON.parse(committed.stdout) as { receipt: { entryHash: string; forecastId: string } }).receipt;
    expect(receipt.forecastId).toBe('forecast-q1');
    expect(existsSync(f.checkpoint)).toBe(true);
    expect(existsSync(`${f.ledger}.checkpoint.json`)).toBe(false);
    const price = f.run('attach-price', '--entry-hash', receipt.entryHash, '--market-prob', '0.5', '--read-at-ms', '1100', '--source', 'official-market-feed');
    expect(price.status, price.stderr).toBe(0);
    const resolution = f.run('resolve', '--entry-hash', receipt.entryHash, '--status', 'RESOLVED_YES', '--resolved-at-ms', '2000');
    expect(resolution.status, resolution.stderr).toBe(0);
    const noPolicy = f.run('status', '--mode', 'empirical', '--model-version', 'model-v1');
    expect(JSON.parse(noPolicy.stdout)).toMatchObject({ resolvedEligibleCount: 0, empiricalEligible: false });
    const policyPath = join(f.root, 'approval-fixture.json');
    writeFileSync(policyPath, JSON.stringify({ policyId: 'approval-fixture', approvalStatus: 'APPROVED', approvedBy: 'fixture-reviewer', approvedAtMs: 500,
      approvalEvidenceRef: 'local-fixture-record', modelVersion: 'model-v1', repeatedForecastRule: 'FIRST_COMMIT_PER_RESEARCH_QUESTION' }));
    const strict = f.run('status', '--mode', 'empirical', '--model-version', 'model-v1', '--policy', policyPath);
    expect(strict.status, strict.stderr).toBe(0);
    expect(JSON.parse(strict.stdout)).toMatchObject({ resolvedEligibleCount: 1, empiricalEligible: true, integrityVerified: true });
    const checkpoint = JSON.parse(readFileSync(f.checkpoint, 'utf8')) as { recordCount: number };
    expect(checkpoint.recordCount).toBe(3);
  });
  it('fails clearly on unsupported/duplicate flags, invalid policy or provenance', () => {
    const f = fixture();
    expect(f.run('status', '--checkpiont', 'typo').status).toBe(1);
    expect(f.run('status', '--mode', 'empirical', '--mode', 'diagnostic').stderr).toMatch(/duplicate/);
    expect(f.run('status', '--mode', 'unexpected').status).toBe(1);
    const invalidPolicy = join(f.root, 'invalid-policy.json'); writeFileSync(invalidPolicy, '{}');
    expect(f.run('status', '--policy', invalidPolicy).status).toBe(1);
    expect(f.run('commit', '--question-id', 'q1', '--raw-prob', '0.6', '--evidence', 'Official publication.', '--model-version', 'v1', '--provenance-kind', 'other').status).toBe(1);
    expect(existsSync(f.ledger)).toBe(false);
  });
});
