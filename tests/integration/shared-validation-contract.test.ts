/**
 * Shared validation contract tests.
 *
 * Verifies validation module contracts across the codebase.
 * Uses real Zod schemas imported from the codebase — no mocks, no synthetic schemas.
 *
 * Post-architecture-separation (2026-07-01): validation modules are co-located
 * with domain logic (sandbox/, platform/api/schemas/) rather than in a centralized
 * src/validation/ directory (removed in Phase 34b cleanup).
 *
 * Requirements: at least 5 tests covering:
 *   1. Domain-level validation modules exist (sandbox + referral schemas)
 *   2. Real Zod schema parses valid data
 *   3. Same schema rejects invalid data
 *   4. Zod is importable with expected methods
 *   5. Schema error messages contain useful path information
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { SandboxInputSchema } from '../../src/desk/sandbox/sandbox-input-encoder';
import { SandboxOutputSchema } from '../../src/desk/sandbox/sandbox-output-validator';
import { trackClickSchema, validateReferralSchema } from '../../src/platform/api/schemas/referral.schemas';

// ── 1. Domain validation module structure ────────────────────────────────

describe('validation module directory structure', () => {
  it('has sandbox input encoder with validation schema', () => {
    const sandboxDir = path.resolve(__dirname, '../../src/desk/sandbox');
    expect(fs.existsSync(sandboxDir)).toBe(true);
    expect(fs.existsSync(path.join(sandboxDir, 'sandbox-input-encoder.ts'))).toBe(true);
  });

  it('has sandbox output validator with validation schema', () => {
    const sandboxDir = path.resolve(__dirname, '../../src/desk/sandbox');
    expect(fs.existsSync(path.join(sandboxDir, 'sandbox-output-validator.ts'))).toBe(true);
  });

  it('has referral schemas for API validation', () => {
    const schemasDir = path.resolve(__dirname, '../../src/platform/api/schemas');
    expect(fs.existsSync(schemasDir)).toBe(true);
    expect(fs.existsSync(path.join(schemasDir, 'referral.schemas.ts'))).toBe(true);
  });

  it('has marketplace backtesting shared module', () => {
    const backtestingDir = path.resolve(__dirname, '../../src/shared/backtesting');
    expect(fs.existsSync(backtestingDir)).toBe(true);
  });

  it('has post similarity engine in shared utils', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../../src/shared/utils/post-similarity-engine.ts'))).toBe(true);
  });
});

// ── 2. Zod is importable with expected methods ───────────────────────────────

describe('Zod primitives are importable', () => {
  it('exports object() constructor', () => {
    expect(typeof z.object).toBe('function');
  });

  it('exports string() constructor', () => {
    expect(typeof z.string).toBe('function');
  });

  it('exports number() constructor', () => {
    expect(typeof z.number).toBe('function');
  });

  it('exports enum() constructor', () => {
    expect(typeof z.enum).toBe('function');
  });

  it('can create a schema and parse successfully', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = schema.safeParse({ name: 'test', age: 42 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'test', age: 42 });
    }
  });
});

// ── 3. SandboxInputSchema parses valid data ──────────────────────────────────

describe('SandboxInputSchema (real codebase schema)', () => {
  const validInput = {
    yesPrice: 0.55,
    noPrice: 0.40,
    prevEma: 0.03,
    alpha: 0.15,
    threshold: 0.02,
  };

  it('parses a valid sandbox input', () => {
    const result = SandboxInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.yesPrice).toBe(0.55);
      expect(result.data.noPrice).toBe(0.40);
      expect(result.data.prevEma).toBe(0.03);
      expect(result.data.alpha).toBe(0.15);
      expect(result.data.threshold).toBe(0.02);
    }
  });

  it('rejects input when a required field is missing', () => {
    const result = SandboxInputSchema.safeParse({ yesPrice: 0.55 });
    expect(result.success).toBe(false);
  });

  it('rejects input when yesPrice is outside the valid bounds (>=1)', () => {
    const result = SandboxInputSchema.safeParse({ ...validInput, yesPrice: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects input when yesPrice is at or below 0', () => {
    const result = SandboxInputSchema.safeParse({ ...validInput, yesPrice: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects input with a non-finite number (NaN)', () => {
    const result = SandboxInputSchema.safeParse({ ...validInput, alpha: NaN });
    expect(result.success).toBe(false);
  });

  it('rejects input with a non-finite number (Infinity)', () => {
    const result = SandboxInputSchema.safeParse({ ...validInput, threshold: Infinity });
    expect(result.success).toBe(false);
  });

  it('rejects input with a wrongly typed field', () => {
    const result = SandboxInputSchema.safeParse({ ...validInput, threshold: '0.02' });
    expect(result.success).toBe(false);
  });
});

// ── 4. SandboxOutputSchema ───────────────────────────────────────────────────

describe('SandboxOutputSchema (real codebase schema)', () => {
  it('parses a valid output', () => {
    const result = SandboxOutputSchema.safeParse({
      spread: 0.15,
      deviation: 0.05,
      newEma: 0.12,
      signal: 1,
      side: 0,
    });
    expect(result.success).toBe(true);
  });

  it('parses output with no-signal state', () => {
    const result = SandboxOutputSchema.safeParse({
      spread: 0.0,
      deviation: 0.0,
      newEma: 0.0,
      signal: 0,
      side: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects signal values outside literal union', () => {
    const result = SandboxOutputSchema.safeParse({
      spread: 0.1,
      deviation: 0.02,
      newEma: 0.1,
      signal: 99,
      side: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects side values outside literal union', () => {
    const result = SandboxOutputSchema.safeParse({
      spread: 0.1,
      deviation: 0.02,
      newEma: 0.1,
      signal: 1,
      side: 2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative newEma', () => {
    const result = SandboxOutputSchema.safeParse({
      spread: 0.1,
      deviation: 0.02,
      newEma: -0.5,
      signal: 0,
      side: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ── 5. Referral schemas ──────────────────────────────────────────────────────

describe('trackClickSchema (real codebase schema)', () => {
  const validClick = {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
  };

  it('parses a valid click with IPv4', () => {
    const result = trackClickSchema.safeParse(validClick);
    expect(result.success).toBe(true);
  });

  it('parses a valid click with IPv6', () => {
    const result = trackClickSchema.safeParse({
      ip: '2001:db8::1',
      userAgent: 'curl/8.0',
    });
    expect(result.success).toBe(true);
  });

  it('parses a click with optional metadata', () => {
    const result = trackClickSchema.safeParse({
      ip: '10.0.0.1',
      userAgent: 'test',
      metadata: { campaign: 'sale-2025', deviceType: 'mobile' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects click with invalid IP string', () => {
    const result = trackClickSchema.safeParse({
      ip: 'not-an-ip',
      userAgent: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects click with missing userAgent', () => {
    const result = trackClickSchema.safeParse({ ip: '10.0.0.1' });
    expect(result.success).toBe(false);
  });
});

describe('validateReferralSchema (real codebase schema)', () => {
  it('parses a valid referral code exactly 8 chars', () => {
    const result = validateReferralSchema.safeParse({
      referralCode: 'ABCDEF12',
      tenantId: 'tenant-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a referral code that is too short', () => {
    const result = validateReferralSchema.safeParse({
      referralCode: 'ABC',
      tenantId: 'tenant-123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a referral code that is too long', () => {
    const result = validateReferralSchema.safeParse({
      referralCode: 'ABCDEF12345',
      tenantId: 'tenant-123',
    });
    expect(result.success).toBe(false);
  });
});

// ── 6. Schema error messages contain useful path information ─────────────────

describe('schema error messages contain useful path information', () => {
  it('SandboxInputSchema errors include field path for missing key', () => {
    const result = SandboxInputSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => `${i.path?.join('.') ?? '(root)'}`).join('; ');
      // At least one issue should reference a field name, not just "(root)"
      const hasFieldPath = result.error.issues.some(
        (i) => i.path && i.path.length > 0,
      );
      expect(hasFieldPath).toBe(true);
    }
  });

  it('trackClickSchema errors include path for invalid field', () => {
    const result = trackClickSchema.safeParse({ ip: 'not-valid', userAgent: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // ip field specific validation should appear in issues
      const hasIpIssue = result.error.issues.some(
        (i) => i.path?.includes('ip'),
      );
      expect(hasIpIssue).toBe(true);
    }
  });

  it('SandboxOutputSchema errors include signal path for out-of-range literal', () => {
    const result = SandboxOutputSchema.safeParse({
      spread: 0.1,
      deviation: 0.02,
      newEma: 0.1,
      signal: 99,
      side: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasSignalPath = result.error.issues.some(
        (i) => i.path?.includes('signal'),
      );
      expect(hasSignalPath).toBe(true);
    }
  });

  it('validateReferralSchema error message references the length constraint', () => {
    const result = validateReferralSchema.safeParse({
      referralCode: 'XX',
      tenantId: 't',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasReferralIssue = result.error.issues.some((i) =>
        i.path?.includes('referralCode'),
      );
      expect(hasReferralIssue).toBe(true);
    }
  });

  it('inline Zod schema error contains human-readable message text', () => {
    const schema = z.object({ email: z.string().email(), age: z.number().int().min(18) });
    const result = schema.safeParse({ email: 'bad', age: 12 });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Each issue should have a non-empty message string
      for (const issue of result.error.issues) {
        expect(typeof issue.message).toBe('string');
        expect(issue.message.length).toBeGreaterThan(0);
      }
    }
  });
});
