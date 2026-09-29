/**
 * End-of-Day Risk Run-Card Generator
 * Formats daily risk & telemetry provenance summaries in Markdown and saves them to data/provenance/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../shared/utils/logger';
import type { ConsolidatedPortfolioSnapshot, ProvenanceRunCard, RiskLedgerEntry } from './telemetry-types';

export class EodRunCardGenerator {
  public static generateMarkdown(
    records: readonly RiskLedgerEntry[],
    chainIntegrityValid: boolean,
    snapshot?: ConsolidatedPortfolioSnapshot,
    dateStr?: string
  ): string {
    const today = dateStr || new Date().toISOString().split('T')[0];
    const totalNav = snapshot?.totalEquityUsd ?? (records.length > 0 ? records[records.length - 1].totalNavUsd : 0);
    const totalPnl = snapshot?.totalMtmPnlUsd ?? 0;
    const roce = snapshot?.roceAnnualized ?? 0;
    const leverage = snapshot?.grossLeverage ?? 0;
    const marginRatio = snapshot?.marginUtilizationRatio ?? 0;

    const lines: string[] = [
      `# End-of-Day Risk Run-Card — ${today}`,
      '',
      '## Executive Summary',
      `- **Date:** \`${today}\``,
      `- **Generated At:** ${new Date().toISOString()}`,
      `- **Ledger Integrity:** \`${chainIntegrityValid ? 'VERIFIED' : 'COMPROMISED'}\``,
      `- **Total Snapshots:** ${records.length}`,
      `- **Total Portfolio NAV:** $${totalNav.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `- **Total MTM PnL:** $${totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `- **Annualized ROCE:** ${(roce * 100).toFixed(2)}%`,
      `- **Gross Leverage:** ${leverage.toFixed(2)}x`,
      `- **Margin Utilization:** ${(marginRatio * 100).toFixed(2)}%`,
      '',
    ];

    if (snapshot?.engineSnapshots) {
      lines.push('## Strategy Engine Attribution');
      lines.push('| Engine | Capital ($) | MTM PnL ($) | Margin ($) | Trades |');
      lines.push('|--------|-------------|-------------|------------|--------|');
      for (const [id, s] of Object.entries(snapshot.engineSnapshots)) {
        lines.push(
          `| \`${id}\` | $${s.allocatedCapitalUsd.toFixed(2)} | $${s.mtmPnlUsd.toFixed(2)} | $${s.marginUsedUsd.toFixed(2)} | ${s.tradeCount} |`
        );
      }
      lines.push('');
    }

    lines.push('## SHA-256 HMAC Hash Chain');
    lines.push('| Seq | NAV ($) | Current Hash | Prev Hash |');
    lines.push('|-----|---------|--------------|-----------|');
    if (records.length === 0) {
      lines.push('| - | - | _No records captured_ | - |');
    } else {
      for (const r of records) {
        lines.push(
          `| ${r.sequenceNumber} | $${r.totalNavUsd.toFixed(2)} | \`${r.currentHash.slice(0, 16)}...\` | \`${r.prevHash.slice(0, 16)}...\` |`
        );
      }
    }
    lines.push('');

    return lines.join('\n');
  }

  public static generateAndSaveRunCard(
    records: readonly RiskLedgerEntry[],
    chainIntegrityValid: boolean,
    snapshot?: ConsolidatedPortfolioSnapshot,
    dateStr?: string,
    outputDir = 'data/provenance'
  ): ProvenanceRunCard {
    const today = dateStr || new Date().toISOString().split('T')[0];
    const runCardId = `eod-risk-run-card-${today}`;
    const filePath = path.join(outputDir, `${runCardId}.md`);
    const markdownContent = this.generateMarkdown(records, chainIntegrityValid, snapshot, today);

    try {
      if (typeof process !== 'undefined' && process.versions?.node) {
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(filePath, markdownContent, 'utf-8');
      }
    } catch (e) {
      logger.warn('Failed to save EOD risk run-card to disk', { filePath, error: String(e) });
    }

    return {
      runCardId,
      date: today,
      generatedAt: Date.now(),
      totalSnapshots: records.length,
      chainIntegrityValid,
      totalNavUsd: snapshot?.totalEquityUsd ?? (records.length > 0 ? records[records.length - 1].totalNavUsd : 0),
      totalMtmPnlUsd: snapshot?.totalMtmPnlUsd ?? 0,
      annualizedRoce: snapshot?.roceAnnualized ?? 0,
      markdownContent,
      filePath,
    };
  }
}
