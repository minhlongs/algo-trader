/**
 * File-based persistence utilities for stateful trading components.
 * Uses append-only JSONL for audit logs and atomic-rename JSON for mutable state.
 * All data stored under ~/.cashclaw/ to survive PM2 restarts.
 */

import { promises as fsp } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

/** Resolve a path under ~/.cashclaw/, creating the dir if needed */
export function cashclawPath(filename: string): string {
  const dir = path.join(os.homedir(), '.cashclaw');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, filename);
}

/**
 * Append a single JSON record as one line to a JSONL file.
 * Append-only = immutable audit log semantics.
 * Non-blocking async implementation.
 */
export async function appendJsonl(filePath: string, record: unknown): Promise<void> {
  const line = JSON.stringify(record) + '\n';
  await fsp.appendFile(filePath, line, 'utf8');
}

/**
 * Read all lines from a JSONL file using a readline stream.
 * Does not load the entire file in-memory.
 */
export async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    await fsp.access(filePath);
  } catch {
    return [];
  }

  const results: T[] = [];
  const fileStream = fs.createReadStream(filePath, 'utf8');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim().length > 0) {
      results.push(JSON.parse(line) as T);
    }
  }

  return results;
}

/**
 * Atomically write a JSON state file using a temp-then-rename pattern.
 * Prevents partial-write corruption on crash mid-write.
 * Non-blocking async implementation.
 */
export async function writeJsonState<T>(filePath: string, state: T): Promise<void> {
  const tmp = `${filePath}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
}

/**
 * Read a JSON state file, returning undefined if not found or invalid.
 * Non-blocking async implementation.
 */
export async function readJsonState<T>(filePath: string): Promise<T | undefined> {
  try {
    await fsp.access(filePath);
    const content = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}
