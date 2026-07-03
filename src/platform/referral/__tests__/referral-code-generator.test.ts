/**
 * Referral Code Generator — Unit Tests
 *
 * Tests:
 * - Generated code matches pattern /^[A-Z0-9]{3}-[A-Z0-9]{5}$/
 * - Different tenantIds produce different codes
 * - isValidReferralCode rejects invalid formats
 */

import { describe, it, expect } from 'vitest';
import { generateReferralCode, isValidReferralCode } from '../referral-code-generator';

describe('generateReferralCode', () => {
  it('generates a code matching the expected pattern', () => {
    const code = generateReferralCode('tenant_001');
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{5}$/);
  });

  it('uses first 3 chars of tenantId as uppercase prefix', () => {
    const code = generateReferralCode('tenant_001');
    expect(code.startsWith('TEN-')).toBe(true);
  });

  it('short tenantIds produce code with only available chars as prefix', () => {
    const code = generateReferralCode('ab');
    expect(code.startsWith('AB-')).toBe(true);
    // With only 2 chars in tenantId, prefix is 2 chars: AB-XXXXX
    expect(code).toMatch(/^[A-Z0-9]{2}-[A-Z0-9]{5}$/);
  });

  it('different tenantIds produce different codes', () => {
    const code1 = generateReferralCode('tenant_001');
    const code2 = generateReferralCode('tenant_002');
    expect(code1).not.toBe(code2);
    expect(code1.slice(0, 3)).toBe('TEN');
    expect(code2.slice(0, 3)).toBe('TEN');
  });

  it('codes from different tenant groups have different prefixes', () => {
    const code1 = generateReferralCode('alice_inc');
    const code2 = generateReferralCode('bob_corp');
    expect(code1.startsWith('ALI-')).toBe(true);
    expect(code2.startsWith('BOB-')).toBe(true);
  });

  it('produces repeatable prefix for the same tenantId', () => {
    const code1 = generateReferralCode('tenant_001');
    const code2 = generateReferralCode('tenant_001');
    // Prefixes should be the same
    expect(code1.split('-')[0]).toBe(code2.split('-')[0]);
  });

  it('generates 5 random characters after the hyphen', () => {
    const code = generateReferralCode('tenant_001');
    const randomPart = code.split('-')[1];
    expect(randomPart).toHaveLength(5);
    expect(randomPart).toMatch(/^[A-Z0-9]{5}$/);
  });
});

describe('isValidReferralCode', () => {
  it('accepts a valid generated code (3+ char tenantId)', () => {
    const code = generateReferralCode('tenant_001');
    expect(isValidReferralCode(code)).toBe(true);
  });

  it('rejects code from short tenantId (prefix under 3 chars)', () => {
    const code = generateReferralCode('ab');
    expect(isValidReferralCode(code)).toBe(false);
  });

  it('accepts a manually constructed valid code', () => {
    expect(isValidReferralCode('ABC-DEFGH')).toBe(true);
  });

  it('rejects codes with lowercase letters', () => {
    expect(isValidReferralCode('abc-DEFGH')).toBe(false);
  });

  it('rejects codes without a hyphen', () => {
    expect(isValidReferralCode('ABCDEFGH')).toBe(false);
  });

  it('rejects codes with wrong prefix length', () => {
    expect(isValidReferralCode('ABCD-EFGHI')).toBe(false);
  });

  it('rejects codes with wrong suffix length', () => {
    expect(isValidReferralCode('ABC-DEFG')).toBe(false);
  });

  it('rejects codes with more than one hyphen', () => {
    expect(isValidReferralCode('AB-C-DEFGH')).toBe(false);
  });

  it('rejects codes containing I,O,0,1 in random part', () => {
    // Generator should never produce I,O,0,1
    const code = generateReferralCode('tenant_001');
    const randomPart = code.split('-')[1];
    expect(randomPart).not.toMatch(/[IO01]/);
  });

  it('rejects empty string', () => {
    expect(isValidReferralCode('')).toBe(false);
  });

  it('rejects null via coercion', () => {
    expect(isValidReferralCode(null as unknown as string)).toBe(false);
  });

  it('rejects undefined via coercion', () => {
    expect(isValidReferralCode(undefined as unknown as string)).toBe(false);
  });

  it('rejects code with special characters', () => {
    expect(isValidReferralCode('ABC-DE@GH')).toBe(false);
  });

  it('rejects code with extra characters after valid part', () => {
    expect(isValidReferralCode('ABC-DEFGH-XYZ')).toBe(false);
  });
});
