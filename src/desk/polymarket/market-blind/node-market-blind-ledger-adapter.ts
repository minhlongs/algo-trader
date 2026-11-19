/**
 * Node.js JSONL File Adapter for `MarketBlindAppendOnlyStore`.
 *
 * Isolated from Worker-safe ledger logic so Cloudflare Workers never bundle `node:fs`.
 * Creates parent directories on demand and writes append-only lines with `0o600` mode.
 */

import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MarketBlindAppendOnlyStore } from './market-blind-ledger-store';

/** Creates a durable Node.js JSONL append-only store backed by `filePath`. */
export function createNodeJsonlAppendStore(filePath: string): MarketBlindAppendOnlyStore {
  const normalizedPath = filePath.trim();
  if (normalizedPath.length === 0) {
    throw new Error('createNodeJsonlAppendStore requires a non-empty filePath');
  }

  let permissionsApplied = false;

  return {
    appendLine(line: string): void {
      if (line.includes('\n') || line.includes('\r')) {
        throw new Error('JSONL appendLine rejects embedded newline characters');
      }
      const parentDir = dirname(normalizedPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
      appendFileSync(normalizedPath, `${line}\n`, { encoding: 'utf8', mode: 0o600 });
      if (!permissionsApplied) {
        chmodSync(normalizedPath, 0o600);
        permissionsApplied = true;
      }
    },

    readAllLines(): string[] {
      if (!existsSync(normalizedPath)) {
        return [];
      }
      const raw = readFileSync(normalizedPath, 'utf8');
      if (raw.length === 0) {
        return [];
      }
      const lines = raw.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      return lines;
    },
  };
}
