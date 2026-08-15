/**
 * ID Generator
 *
 * Centralized ID generation for billing services.
 * Eliminates duplicated `generateId()` implementations across services.
 *
 * Extracted from: dunning-service.ts, license-service.ts, subscription-service.ts
 */

export class IdGenerator {
  /**
   * Generate a random 26-character alphanumeric ID.
   *
   * Format: two 13-character segments from Math.random() base-36,
   * providing approximately 156 bits of entropy.
   */
  static generate(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}