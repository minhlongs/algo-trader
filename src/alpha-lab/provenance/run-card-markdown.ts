/**
 * Run Card Markdown Formatter
 */

import { type RunCard, type DataSourceEntry, type DataSourceProvenance } from './run-card-types';

function isDataSourceProvenance(ds: DataSourceEntry): ds is DataSourceProvenance {
  return typeof ds === 'object' && ds !== null && 'provider' in ds;
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'n/a';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Render a run card as a human-readable markdown report. */
export function renderMarkdown(card: RunCard): string {
  const lines: string[] = [];
  lines.push(`# Run Card — ${card.runId}`);
  lines.push('');
  lines.push(`- **Schema:** \`${card.schemaVersion}\``);
  lines.push(`- **Created:** ${card.createdAt}`);
  lines.push(`- **Result class:** \`${card.resultClass}\``);
  lines.push(`- **Strategy:** ${card.strategyRef}`);
  lines.push(`- **Config hash:** \`${card.configHash}\``);
  if (card.lifecycleState) {
    lines.push(`- **Lifecycle state:** \`${card.lifecycleState}\``);
  }
  if (card.hypothesisId) {
    lines.push(`- **Hypothesis ID:** ${card.hypothesisId}`);
  }
  if (card.hypothesis) {
    lines.push(`- **Hypothesis:** ${card.hypothesis}`);
  }
  if (card.writeError) {
    lines.push(`- **⚠️ Write error:** ${card.writeError}`);
  }
  lines.push('');
  lines.push('## Data sources');
  lines.push('');
  if (card.dataSources.length === 0) {
    lines.push('_No data sources recorded._');
  } else {
    for (const ds of card.dataSources) {
      if (typeof ds === 'string') {
        lines.push(`- \`${ds}\``);
      } else if (isDataSourceProvenance(ds)) {
        lines.push(
          `- \`${ds.provider}\` ${ds.symbol}/${ds.timeframe} ` +
          `(${ds.candleCount} candles, ${ds.start} → ${ds.end}, retrieved ${ds.retrievedAt})` +
          (ds.dataVersion ? `, version ${ds.dataVersion}` : '') +
          (ds.transform ? `\n  - transform: ${ds.transform}` : ''),
        );
      }
    }
  }
  lines.push('');
  if (card.parameters && Object.keys(card.parameters).length > 0) {
    lines.push('## Parameters');
    lines.push('');
    lines.push('| Parameter | Value |');
    lines.push('|---|---|');
    for (const [key, value] of Object.entries(card.parameters)) {
      lines.push(`| ${key} | ${formatValue(value)} |`);
    }
    lines.push('');
  }
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  for (const [key, value] of Object.entries(card.metrics)) {
    lines.push(`| ${key} | ${value === undefined ? 'n/a' : value} |`);
  }
  lines.push('');
  if (card.foldMetrics && Object.keys(card.foldMetrics).length > 0) {
    lines.push('## Fold Metrics');
    lines.push('');
    lines.push('| Fold / Metric | Value |');
    lines.push('|---|---|');
    for (const [key, value] of Object.entries(card.foldMetrics)) {
      lines.push(`| ${key} | ${value === undefined ? 'n/a' : value} |`);
    }
    lines.push('');
  }
  if (card.gateResults.length > 0) {
    lines.push('## Gates');
    lines.push('');
    for (const g of card.gateResults) {
      lines.push(`- \`${g.gateId}\`: ${g.passed ? '✅ pass' : '❌ fail'}${g.detail ? ` — ${g.detail}` : ''}`);
    }
    lines.push('');
  }
  if (card.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of card.warnings) lines.push(`- ${w}`);
    lines.push('');
  }
  return lines.join('\n');
}
