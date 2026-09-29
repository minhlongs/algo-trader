import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EodRunCardGenerator } from '../../../src/desk/telemetry/eod-run-card-generator';
import type { RiskLedgerEntry, ConsolidatedPortfolioSnapshot } from '../../../src/desk/telemetry/telemetry-types';

describe('EodRunCardGenerator', () => {
  const testOutputDir = 'data/test-provenance';

  afterEach(() => {
    try {
      if (fs.existsSync(testOutputDir)) {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  const sampleRecords: RiskLedgerEntry[] = [
    {
      sequenceNumber: 1,
      timestamp: 1700000000000,
      date: '2026-09-28',
      totalNavUsd: 105000,
      allocations: { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
      pnlSnapshot: { arbitrage: 1200, marl: 800, amm: 1500, 'alpha-lab': 1500 },
      prevHash: 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000',
      currentHash: 'b'.repeat(64),
    },
  ];

  const sampleSnapshot: ConsolidatedPortfolioSnapshot = {
    timestamp: 1700000000000,
    totalEquityUsd: 105000,
    unallocatedCashUsd: 25000,
    allocatedCapitalUsd: 80000,
    totalMtmPnlUsd: 5000,
    grossLeverage: 1.15,
    marginUtilizationRatio: 0.28,
    roceAnnualized: 0.22,
    accountingDriftUsd: 0,
    engineSnapshots: {
      arbitrage: { engineId: 'arbitrage', allocatedCapitalUsd: 20000, mtmPnlUsd: 1200, marginUsedUsd: 5000, tradeCount: 15 },
      marl: { engineId: 'marl', allocatedCapitalUsd: 20000, mtmPnlUsd: 800, marginUsedUsd: 6000, tradeCount: 25 },
      amm: { engineId: 'amm', allocatedCapitalUsd: 20000, mtmPnlUsd: 1500, marginUsedUsd: 7000, tradeCount: 18 },
      'alpha-lab': { engineId: 'alpha-lab', allocatedCapitalUsd: 20000, mtmPnlUsd: 1500, marginUsedUsd: 8000, tradeCount: 12 },
    },
  };

  it('renders markdown with executive summary and engine table', () => {
    const md = EodRunCardGenerator.generateMarkdown(sampleRecords, true, sampleSnapshot, '2026-09-28');
    expect(md).toContain('# End-of-Day Risk Run-Card — 2026-09-28');
    expect(md).toContain('`VERIFIED`');
    expect(md).toContain('$105,000.00');
    expect(md).toContain('| `arbitrage` | $20000.00 | $1200.00 | $5000.00 | 15 |');
    expect(md).toContain('## SHA-256 HMAC Hash Chain');
  });

  it('generates and saves run card file returning ProvenanceRunCard', () => {
    const card = EodRunCardGenerator.generateAndSaveRunCard(
      sampleRecords,
      true,
      sampleSnapshot,
      '2026-09-28',
      testOutputDir
    );

    expect(card.runCardId).toBe('eod-risk-run-card-2026-09-28');
    expect(card.chainIntegrityValid).toBe(true);
    expect(card.totalNavUsd).toBe(105000);
    expect(card.filePath).toBeDefined();

    if (card.filePath) {
      expect(fs.existsSync(card.filePath)).toBe(true);
      const content = fs.readFileSync(card.filePath, 'utf-8');
      expect(content).toContain('End-of-Day Risk Run-Card');
    }
  });

  it('handles empty records array gracefully', () => {
    const md = EodRunCardGenerator.generateMarkdown([], true);
    expect(md).toContain('- **Total Snapshots:** 0');
    expect(md).toContain('_No records captured_');
  });
});
