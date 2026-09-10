/**
 * Subscription File Storage Helper
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Subscription } from './subscription-types';

export const STORE_PATH =
  process.env.SUBSCRIPTION_STORE_PATH || path.join(process.cwd(), 'data', 'subscriptions.json');

export function saveToFile(subscriptions: Map<string, Subscription>): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(Array.from(subscriptions.entries()), null, 2);
  fs.writeFileSync(STORE_PATH, data, { encoding: 'utf-8', mode: 0o600 });
}

export function clearStoreFile(): void {
  try {
    if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
  } catch {
    /* ignore */
  }
}

export function loadFromFile(): Map<string, Subscription> {
  try {
    if (!fs.existsSync(STORE_PATH)) return new Map();
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const entries: [string, Subscription][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}
