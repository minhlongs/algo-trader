/**
 * Alpha Report Store
 *
 * Persists alpha evaluation verdicts by candidateId so they can be retrieved
 * via the Research MCP server's get_alpha_report tool.
 *
 * Mirrors the run-card-index pattern: write to a temp dir in tests, configurable
 * root in production. Read-only index with last-write-wins on duplicate candidateId.
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../../shared/utils/logger';
import type { AlphaVerdict } from '../attribution/alpha-evaluator';

/** Default root searched for alpha reports, relative to the process CWD. */
export const DEFAULT_ALPHA_REPORT_ROOT = 'data/alpha-reports';

export interface AlphaReport {
  candidateId: string;
  verdict: AlphaVerdict;
  createdAt: string;
}

export interface AlphaReportIndexEntry {
  candidateId: string;
  path: string;
}

/** Write an alpha report to disk under `reportDir`. Never throws — captures error on the returned report. */
export async function writeAlphaReport(
  reportDir: string,
  candidateId: string,
  verdict: AlphaVerdict,
): Promise<AlphaReport> {
  const createdAt = new Date().toISOString();
  const report: AlphaReport = {
    candidateId,
    verdict,
    createdAt,
  };

  try {
    await mkdir(reportDir, { recursive: true });
    await writeFile(join(reportDir, `${candidateId}.json`), JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[AlphaReportStore] write failed', { candidateId, err: message });
    // Still return the report (in-memory) so caller has the verdict
  }

  return report;
}

/** Walk `root` recursively and return every `*.json` alpha report found. */
async function walkAlphaReports(
  root: string,
  entries: AlphaReportIndexEntry[],
): Promise<void> {
  try {
    const items = await readdir(root, { withFileTypes: true });
    for (const item of items) {
      const full = join(root, item.name);
      if (item.isDirectory()) {
        await walkAlphaReports(full, entries);
      } else if (item.isFile() && item.name.endsWith('.json')) {
        const candidateId = item.name.slice(0, -5); // strip .json
        entries.push({ candidateId, path: full });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[AlphaReportStore] walk failed', { root, err: message });
  }
}

/** Build a candidateId -> path index for a given root. */
export async function buildAlphaReportIndex(
  root: string = DEFAULT_ALPHA_REPORT_ROOT,
): Promise<Map<string, AlphaReportIndexEntry>> {
  const index = new Map<string, AlphaReportIndexEntry>();
  const found = await indexAlphaReports(root);
  for (const entry of found) {
    // Last write wins on duplicate candidateId
    index.set(entry.candidateId, entry);
  }
  return index;
}

/** Internal: index all alpha reports in a root. */
async function indexAlphaReports(root: string): Promise<AlphaReportIndexEntry[]> {
  const entries: AlphaReportIndexEntry[] = [];
  await walkAlphaReports(root, entries);
  return entries;
}

/** Read and parse an alpha report by candidateId. Returns null when not found or unreadable. */
export async function readAlphaReportByCandidateId(
  candidateId: string,
  root: string = DEFAULT_ALPHA_REPORT_ROOT,
): Promise<AlphaReport | null> {
  const index = await buildAlphaReportIndex(root);
  const entry = index.get(candidateId);
  if (!entry) return null;
  try {
    const raw = await readFile(entry.path, 'utf8');
    return JSON.parse(raw) as AlphaReport;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[AlphaReportStore] unreadable alpha report', { candidateId, path: entry.path, err: message });
    return null;
  }
}

/** List all alpha reports (metadata only, no verdict bodies). */
export async function listAlphaReports(
  root: string = DEFAULT_ALPHA_REPORT_ROOT,
  limit = 100,
): Promise<{ candidateId: string; createdAt: string; passed: boolean }[]> {
  const index = await buildAlphaReportIndex(root);
  const reports: { candidateId: string; createdAt: string; passed: boolean }[] = [];
  for (const [, entry] of index) {
    try {
      const raw = await readFile(entry.path, 'utf8');
      const report = JSON.parse(raw) as AlphaReport;
      reports.push({
        candidateId: report.candidateId,
        createdAt: report.createdAt,
        passed: report.verdict.passed,
      });
    } catch { /* skip unreadable */ }
  }
  // Most recent first
  reports.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reports.slice(0, limit);
}