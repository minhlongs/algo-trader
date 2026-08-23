/**
 * Run Card Index
 *
 * Locates run-card artifacts on disk by runId. Run cards are written by the
 * experiment engine and backtest runner into caller-supplied directories; this
 * module scans conventional roots and builds an in-memory index so read-only
 * consumers (the Research MCP server, reviewers, auditors) can fetch a card by
 * its runId without knowing the directory it landed in.
 *
 * Read-only: never writes, never mutates. A missing root or unreadable card is
 * skipped — the index degrades gracefully rather than throwing.
 */

import { readFile, readdir } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../../shared/utils/logger';
import type { RunCard } from './run-card';

/** Default roots searched for run cards, relative to the process CWD. */
export const DEFAULT_RUN_CARD_ROOTS = ['data/runs', 'data/experiments', 'data/backtests'];

export interface RunCardIndexEntry {
  runId: string;
  path: string;
}

/**
 * Walk `root` recursively and return every `run_card.json` found.
 * Fail-safe: a root that does not exist yields nothing; a directory that cannot
 * be read is skipped and logged.
 */
export async function indexRunCards(root: string): Promise<RunCardIndexEntry[]> {
  const entries: RunCardIndexEntry[] = [];
  try {
    await walk(root, entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[RunCardIndex] walk failed', { root, err: message });
  }
  return entries;
}

/** Build a runId -> path index across multiple roots. */
export async function buildRunCardIndex(
  roots: string[] = DEFAULT_RUN_CARD_ROOTS,
): Promise<Map<string, RunCardIndexEntry>> {
  const index = new Map<string, RunCardIndexEntry>();
  for (const root of roots) {
    const found = await indexRunCards(root);
    for (const entry of found) {
      // Last write wins on duplicate runId; this is a read-only index, so the
      // collision is informational rather than a correctness hazard.
      index.set(entry.runId, entry);
    }
  }
  return index;
}

/**
 * Read and parse a run card by runId. Returns null when no card exists for the
 * given runId, or when the card file is unreadable / malformed.
 */
export async function readRunCardByRunId(
  runId: string,
  roots: string[] = DEFAULT_RUN_CARD_ROOTS,
): Promise<RunCard | null> {
  const index = await buildRunCardIndex(roots);
  const entry = index.get(runId);
  if (!entry) return null;
  try {
    const raw = await readFile(entry.path, 'utf8');
    return JSON.parse(raw) as RunCard;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[RunCardIndex] unreadable run card', { runId, path: entry.path, err: message });
    return null;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function walk(dir: string, entries: RunCardIndexEntry[]): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return; // root missing or unreadable — nothing to index
  }
  for (const name of names) {
    const full = join(dir, name);
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      await walk(full, entries);
    } else if (name === 'run_card.json') {
      try {
        const raw = await readFile(full, 'utf8');
        const card = JSON.parse(raw) as RunCard;
        if (card && typeof card.runId === 'string') {
          entries.push({ runId: card.runId, path: full });
        }
      } catch {
        // Malformed card — skip, do not fail the whole index.
      }
    }
  }
}