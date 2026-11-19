import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryAppendOnlyStore } from '../../src/desk/polymarket/market-blind/market-blind-ledger-store';
import { ProspectivePipelineLedger, attachPostCommitMarketSnapshot, evaluateProspectiveOosReport, recordMarketBlindResolution, submitMarketBlindForecast } from '../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';
import { createNodeJsonlAppendStore } from '../../src/desk/polymarket/market-blind/node-market-blind-ledger-adapter';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const forecast = (ledger: ProspectivePipelineLedger, questionId = 'same-question', committedAtMs = 1000) => submitMarketBlindForecast(ledger, {
  questionId, committedAtMs, pRaw: 0.6, modelVersion: 'model-v1', evidence: 'Official publication.',
});

describe('prospective ledger persistence regressions', () => {
  it('does not inflate the denominator with repeated forecasts of one question', () => {
    const ledger = new ProspectivePipelineLedger();
    for (const t of [1000, 2000]) {
      const receipt = forecast(ledger, 'same-question', t);
      attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.5, marketReadAtMs: t + 1 });
    }
    recordMarketBlindResolution(ledger, { questionId: 'same-question', status: 'RESOLVED_YES', resolvedAtMs: 3000 });
    expect(evaluateProspectiveOosReport(ledger).resolvedScoredCount).toBe(1);
  });

  it('rejects valid-tail truncation against the independently retained terminal head', () => {
    const root = mkdtempSync(join(tmpdir(), 'mb-regression-'));
    roots.push(root);
    const path = join(root, 'ledger.jsonl');
    const ledger = new ProspectivePipelineLedger(createNodeJsonlAppendStore(path));
    forecast(ledger, 'q-first');
    forecast(ledger, 'q-tail', 2000);
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
    writeFileSync(path, `${lines[0]}\n`);
    expect(() => ProspectivePipelineLedger.hydrateFromStore(createNodeJsonlAppendStore(path))).toThrow(/INTEGRITY/);
  });

  it('does not publish a failed commit into RAM', () => {
    const ledger = new ProspectivePipelineLedger({ readAllLines: () => [], appendLine: () => { throw new Error('append failure'); } });
    expect(() => forecast(ledger)).toThrow('append failure');
    expect(ledger.recordCount()).toBe(0);
    expect(ledger.commitsByHash.size).toBe(0);
    expect(ledger.verifyChainIntegrity()).toBe(false);
  });

  it('does not publish a failed resolution into RAM', () => {
    const backing = createInMemoryAppendOnlyStore();
    let fail = false;
    const ledger = new ProspectivePipelineLedger({ readAllLines: () => backing.readAllLines(), appendLine: (line) => {
      if (fail) throw new Error('resolution append failure');
      backing.appendLine(line);
    } });
    const receipt = forecast(ledger);
    attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.5, marketReadAtMs: 1100 });
    fail = true;
    expect(() => recordMarketBlindResolution(ledger, { entryHash: receipt.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000 })).toThrow('resolution append failure');
    expect(ledger.resolutions.size).toBe(0);
    expect(evaluateProspectiveOosReport(ledger).skillGate.unlocked).toBe(false);
  });
});
