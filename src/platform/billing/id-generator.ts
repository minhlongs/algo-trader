/**
 * ID Generator
 *
 * Centralized ID generation for billing services.
 * Eliminates duplicated `generateId()` implementations across services.
 *
 * Extracted from: dunning-service.ts, license-service.ts, subscription-service.ts
 */

import { randomBytes } from 'node:crypto';

export class IdGenerator {
  /**
   * Generate a random 26-character alphanumeric ID.
   *
   * Uses crypto.getRandomValues for cryptographically secure randomness.
   */
  static generate(): string {
    const bytes = randomBytes(20);
    return Buffer.from(bytes).toString('base64url').replace(/[-_]/g, '').slice(0, 26);
  }
}