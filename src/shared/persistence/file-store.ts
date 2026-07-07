
/**
 * File-based persistence utilities for stateful trading components.
 * Uses append-only JSONL for audit logs and atomic-rename JSON for mutable state.
 * All data stored under ~/.cashclaw/ to survive PM2 restarts.
 */

import * as fsp from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createInterface } from 'readline';

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
 */
export function appendJsonl(filePath: string, record: unknown): void {
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');
}

/**
 * Read all lines from a JSONL file.
 * Does not load the entire file in-memory.
 */
export async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    fs.accessSync(filePath);
  } catch {
    return [];
  }

  const results: T[] = [];
  const fileStream = fs.createReadStream(filePath, 'utf8');
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

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
 */
export function writeJsonState<T>(filePath: string, state: T): void {
  const tmp = `${filePath}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * Read a JSON state file, returning undefined if not found or invalid.
 * Returns the parsed value directly.
 */
export function readJsonState<T>(filePath: string): T | undefined {
  try {
    fs.accessSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}
