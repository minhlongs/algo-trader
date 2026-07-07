import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../utils/logger';

const BASE_DIR = process.env.CASHCLAW_DATA_DIR ?? './data';

export function cashclawPath(filename: string): string {
  return path.join(BASE_DIR, filename);
}

export function writeJsonState(filepath: string, data: unknown): void {
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.error('[FileStore] Failed to write state:', err);
    throw err;
  }
}

export function readJsonState<T = unknown>(filepath: string): T | null {
  try {
    if (!fs.existsSync(filepath)) return null;
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content) as T;
  } catch (err) {
    logger.warn('[FileStore] Failed to read state:', err);
    return null;
  }
}

export function appendJsonl(filepath: string, record: unknown): void {
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(filepath, line, 'utf8');
  } catch (err) {
    logger.error('[FileStore] Failed to append JSONL:', err);
    throw err;
  }
}
