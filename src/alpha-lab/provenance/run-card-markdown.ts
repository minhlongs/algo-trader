/**
 * Run Card Markdown Formatter
 */

import { type RunCard } from './run-card-types';

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
      lines.push(
        `- \`${ds.provider}\` ${ds.symbol}/${ds.timeframe} ` +
        `(${ds.candleCount} candles, ${ds.start} → ${ds.end}, retrieved ${ds.retrievedAt})` +
        (ds.dataVersion ? `, version ${ds.dataVersion}` : '') +
        (ds.transform ? `\n  - transform: ${ds.transform}` : ''),
      );
    }
  }
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  for (const [key, value] of Object.entries(card.metrics)) {
    lines.push(`| ${key} | ${value === undefined ? 'n/a' : value} |`);
  }
  lines.push('');
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
