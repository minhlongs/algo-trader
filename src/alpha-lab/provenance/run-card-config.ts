/**
 * Run Card Config Canonicalisation & Hashing
 */

import { createHash } from 'node:crypto';

/**
 * Deterministically canonicalise a config object for hashing:
 * stringify with sorted keys at every level, no whitespace, no undefined.
 */
export function canonicaliseConfig(config: Record<string, unknown>): string {
  return JSON.stringify(sortDeep(config));
}

export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

export function hashConfig(config: Record<string, unknown>): string {
  return createHash('sha256').update(canonicaliseConfig(config)).digest('hex');
}
