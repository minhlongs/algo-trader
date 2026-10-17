/**
 * Pure file persistence and crypto helpers for ApiKeyManager.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { LicenseTier } from '../../shared/types/license';

export interface ApiKey {
  id: string;
  keyHash: string;    // SHA-256 of full key — never store plaintext
  keyPrefix: string;  // first 8 chars for display
  licenseId: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  isActive: boolean;
}

export interface GeneratedApiKey {
  key: string;    // Full key — shown ONCE, never persisted
  apiKey: ApiKey; // Stored record (hashed)
}

export const MAX_ACTIVE_KEYS = 3;

/** Tier abbreviations for key prefix */
export const TIER_ABBREV: Record<LicenseTier, string> = {
  [LicenseTier.FREE]: 'free',
  [LicenseTier.STARTER]: 'str',
  [LicenseTier.PRO]: 'pro',
  [LicenseTier.ENTERPRISE]: 'ent',
  [LicenseTier.MASTER]: 'mst',
};

export const STORE_PATH = process.env.API_KEY_STORE_PATH
  || path.join(process.cwd(), 'data', 'api-keys.json');

export function saveToFile(keys: Map<string, ApiKey>): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const data = JSON.stringify(Array.from(keys.entries()), null, 2);
  fs.writeFileSync(STORE_PATH, data, 'utf-8');
}

export function loadFromFile(): Map<string, ApiKey> {
  try {
    if (!fs.existsSync(STORE_PATH)) return new Map();
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const entries: [string, ApiKey][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function generateRandomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}
