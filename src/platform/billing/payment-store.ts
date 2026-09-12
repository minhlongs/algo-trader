/**
 * Payment File Persistence Store
 */

import * as fs from 'fs';
import * as path from 'path';
import { type Payment } from './payment-types';

export const STORE_PATH = process.env.PAYMENT_STORE_PATH || path.join(process.cwd(), 'data', 'payments.json');

export function saveToFile(payments: Map<string, Payment>): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(Array.from(payments.entries()), null, 2);
  fs.writeFileSync(STORE_PATH, data, { encoding: 'utf-8', mode: 0o600 });
}

export function loadFromFile(): Map<string, Payment> {
  try {
    if (!fs.existsSync(STORE_PATH)) return new Map();
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const entries: [string, Payment][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}
