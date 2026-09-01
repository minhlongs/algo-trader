/**
 * NOWPayments Utils — Unit Tests
 *
 * Covers the pure-utility functions: sortObjectDeep, constantTimeEqual,
 * normalizePaymentStatus, isTerminalStatus, makeError, configError,
 * validationError, apiError, compactObject, isNonEmptyString, isPositiveNumber,
 * assertString, assertPositiveNumber.
 */

import { describe, it, expect } from 'vitest';
import {
  sortObjectDeep,
  constantTimeEqual,
  PAYMENT_STATUS,
  normalizePaymentStatus,
  TERMINAL_STATUSES,
  isTerminalStatus,
  TYPE_ERROR,
  makeError,
  configError,
  validationError,
  apiError,
  compactObject,
  isNonEmptyString,
  isPositiveNumber,
  assertString,
  assertPositiveNumber,
} from '../nowpayments-utils';

describe('nowpayments-utils', () => {
  describe('sortObjectDeep', () => {
    it('sorts keys in a flat object', () => {
      const input = { zebra: 1, apple: 2, mango: 3 };
      const result = sortObjectDeep(input);
      const keys = Object.keys(result as Record<string, unknown>);
      expect(keys).toEqual(['apple', 'mango', 'zebra']);
    });

    it('sorts nested objects recursively', () => {
      const input = { zebra: { y: 1, a: 2 }, apple: 2 };
      const result = sortObjectDeep(input) as Record<string, Record<string, unknown>>;
      const topKeys = Object.keys(result);
      expect(topKeys).toEqual(['apple', 'zebra']);
      expect(Object.keys(result.zebra)).toEqual(['a', 'y']);
    });

    it('sorts arrays element-wise', () => {
      const input = [{ z: 1, a: 2 }, { y: 3, b: 4 }];
      const result = sortObjectDeep(input) as Record<string, unknown>[];
      expect(result).toHaveLength(2);
      expect(Object.keys(result[0])).toEqual(['a', 'z']);
      expect(Object.keys(result[1])).toEqual(['b', 'y']);
    });

    it('returns primitives and null as-is', () => {
      expect(sortObjectDeep(42)).toBe(42);
      expect(sortObjectDeep('hello')).toBe('hello');
      expect(sortObjectDeep(null)).toBeNull();
      expect(sortObjectDeep(undefined)).toBeUndefined();
    });

    it('returns arrays of primitives as-is', () => {
      expect(sortObjectDeep([3, 1, 2])).toEqual([3, 1, 2]);
    });

    it('handles empty objects', () => {
      const result = sortObjectDeep({});
      expect(result).toEqual({});
    });

    it('handles non-plain objects (Date etc.) by returning as-is', () => {
      const date = new Date();
      const result = sortObjectDeep({ date });
      expect((result as { date: Date }).date).toBe(date);
    });
  });

  describe('constantTimeEqual', () => {
    it('returns true for equal hex strings', () => {
      const hex1 = Buffer.from('test').toString('hex');
      const hex2 = Buffer.from('test').toString('hex');
      expect(constantTimeEqual(hex1, hex2)).toBe(true);
    });

    it('returns false for different hex strings', () => {
      const hex1 = Buffer.from('test1').toString('hex');
      const hex2 = Buffer.from('test2').toString('hex');
      expect(constantTimeEqual(hex1, hex2)).toBe(false);
    });

    it('returns true for equal Uint8Array buffers', () => {
      expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    });

    it('returns false for different Uint8Array buffers', () => {
      expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    });

    it('returns false for different length inputs', () => {
      expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
    });

    it('returns true for empty inputs', () => {
      expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
      expect(constantTimeEqual('', '')).toBe(true);
    });

    it('handles mixed string and Uint8Array input', () => {
      const bytes = new Uint8Array([104, 101, 108, 108, 111]); // 'hello'
      const hex = Buffer.from('hello').toString('hex');
      expect(constantTimeEqual(hex, bytes)).toBe(true);
    });
  });

  describe('normalizePaymentStatus', () => {
    it('normalizes known statuses', () => {
      expect(normalizePaymentStatus('waiting')).toBe('pending');
      expect(normalizePaymentStatus('confirming')).toBe('processing');
      expect(normalizePaymentStatus('confirmed')).toBe('processing');
      expect(normalizePaymentStatus('sending')).toBe('processing');
      expect(normalizePaymentStatus('partially_paid')).toBe('partially_paid');
      expect(normalizePaymentStatus('finished')).toBe('paid');
      expect(normalizePaymentStatus('failed')).toBe('failed');
      expect(normalizePaymentStatus('refunded')).toBe('refunded');
      expect(normalizePaymentStatus('expired')).toBe('expired');
      expect(normalizePaymentStatus('cancelled')).toBe('cancelled');
      expect(normalizePaymentStatus('canceled')).toBe('cancelled');
    });

    it('handles case-insensitive input', () => {
      expect(normalizePaymentStatus('WAITING')).toBe('pending');
      expect(normalizePaymentStatus('Finished')).toBe('paid');
    });

    it('returns unknown for unrecognized statuses', () => {
      expect(normalizePaymentStatus('something_random')).toBe('unknown');
    });

    it('returns unknown for empty or invalid input', () => {
      expect(normalizePaymentStatus('')).toBe('unknown');
      expect(normalizePaymentStatus(null as unknown as string)).toBe('unknown');
      expect(normalizePaymentStatus(undefined as unknown as string)).toBe('unknown');
      expect(normalizePaymentStatus(123 as unknown as string)).toBe('unknown');
    });
  });

  describe('isTerminalStatus', () => {
    it('returns true for API statuses that normalize to terminal statuses', () => {
      expect(isTerminalStatus('finished')).toBe(true); // → paid
      expect(isTerminalStatus('partially_paid')).toBe(true);
      expect(isTerminalStatus('failed')).toBe(true);
      expect(isTerminalStatus('refunded')).toBe(true);
      expect(isTerminalStatus('expired')).toBe(true);
      expect(isTerminalStatus('cancelled')).toBe(true);
      expect(isTerminalStatus('canceled')).toBe(true); // spelling variant
    });

    it('returns false for non-terminal API statuses', () => {
      expect(isTerminalStatus('waiting')).toBe(false); // → pending
      expect(isTerminalStatus('confirming')).toBe(false); // → processing
      expect(isTerminalStatus('sending')).toBe(false);
    });

    it('accepts raw API statuses by normalizing first', () => {
      expect(isTerminalStatus('finished')).toBe(true);
      expect(isTerminalStatus('canceled')).toBe(true);
      expect(isTerminalStatus('waiting')).toBe(false);
    });

    it('returns false for unknown statuses', () => {
      expect(isTerminalStatus('unknown')).toBe(false);
      expect(isTerminalStatus('bogus')).toBe(false);
    });
  });

  describe('PAYMENT_STATUS & TERMINAL_STATUSES constants', () => {
    it('exposes all expected PAYMENT_STATUS values', () => {
      expect(PAYMENT_STATUS.PENDING).toBe('pending');
      expect(PAYMENT_STATUS.PROCESSING).toBe('processing');
      expect(PAYMENT_STATUS.PAID).toBe('paid');
      expect(PAYMENT_STATUS.PARTIALLY_PAID).toBe('partially_paid');
      expect(PAYMENT_STATUS.FAILED).toBe('failed');
      expect(PAYMENT_STATUS.REFUNDED).toBe('refunded');
      expect(PAYMENT_STATUS.EXPIRED).toBe('expired');
      expect(PAYMENT_STATUS.CANCELLED).toBe('cancelled');
      expect(PAYMENT_STATUS.UNKNOWN).toBe('unknown');
    });

    it('TERMINAL_STATUSES contains exactly the terminal statuses', () => {
      expect(TERMINAL_STATUSES).toEqual(['paid', 'partially_paid', 'failed', 'refunded', 'expired', 'cancelled']);
    });
  });

  describe('makeError', () => {
    it('creates an error shape with defaults', () => {
      const err = makeError('something broke');
      expect(err).toEqual({
        error: 'something broke',
        type: 'unknown',
        code: 'UNEXPECTED_ERROR',
        httpStatus: 500,
      });
    });

    it('creates an error with specified type, code, httpStatus, and details', () => {
      const err = makeError('bad request', 'validation', 'BAD_INPUT', 400, { field: 'amount' });
      expect(err).toEqual({
        error: 'bad request',
        type: 'validation',
        code: 'BAD_INPUT',
        httpStatus: 400,
        details: { field: 'amount' },
      });
    });
  });

  describe('configError', () => {
    it('creates a configuration error with default code and 500 status', () => {
      const err = configError('missing API key');
      expect(err).toEqual({
        error: 'missing API key',
        type: 'configuration',
        code: 'CONFIGURATION_ERROR',
        httpStatus: 500,
      });
    });

    it('creates a configuration error with custom code', () => {
      const err = configError('bad URL', 'BAD_URL');
      expect(err.code).toBe('BAD_URL');
      expect(err.type).toBe('configuration');
    });
  });

  describe('validationError', () => {
    it('creates a validation error with 400 status and default code', () => {
      const err = validationError('field required');
      expect(err).toEqual({
        error: 'field required',
        type: 'validation',
        code: 'VALIDATION_ERROR',
        httpStatus: 400,
      });
    });

    it('creates a validation error with custom code and details', () => {
      const err = validationError('invalid amount', 'INVALID_AMOUNT', { value: -5 });
      expect(err.code).toBe('INVALID_AMOUNT');
      expect(err.httpStatus).toBe(400);
      expect(err.details).toEqual({ value: -5 });
    });
  });

  describe('apiError', () => {
    it('creates an api error with default code and 502 status', () => {
      const err = apiError('upstream timeout');
      expect(err).toEqual({
        error: 'upstream timeout',
        type: 'api',
        code: 'API_ERROR',
        httpStatus: 502,
      });
    });

    it('creates an api error with custom status code', () => {
      const err = apiError('not found', 'NOT_FOUND', 404);
      expect(err.httpStatus).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.type).toBe('api');
    });
  });

  describe('compactObject', () => {
    it('removes undefined values', () => {
      const input = { a: 1, b: undefined, c: 'x', d: undefined };
      expect(compactObject(input)).toEqual({ a: 1, c: 'x' });
    });

    it('preserves null values', () => {
      const input = { a: 1, b: null, c: 'x' };
      expect(compactObject(input)).toEqual({ a: 1, b: null, c: 'x' });
    });

    it('preserves falsy values like 0 and false', () => {
      const input = { a: 0, b: false, c: '', d: undefined };
      expect(compactObject(input)).toEqual({ a: 0, b: false, c: '' });
    });

    it('returns empty object for all-undefined input', () => {
      const input = { a: undefined, b: undefined };
      expect(compactObject(input)).toEqual({});
    });

    it('returns empty object for empty input', () => {
      expect(compactObject({})).toEqual({});
    });
  });

  describe('isNonEmptyString', () => {
    it('returns true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('x')).toBe(true);
    });

    it('returns false for strings with only whitespace', () => {
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString('\t\n')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
    });
  });

  describe('isPositiveNumber', () => {
    it('returns true for positive finite numbers', () => {
      expect(isPositiveNumber(1)).toBe(true);
      expect(isPositiveNumber(0.001)).toBe(true);
      expect(isPositiveNumber(999999)).toBe(true);
    });

    it('returns false for zero and negative numbers', () => {
      expect(isPositiveNumber(0)).toBe(false);
      expect(isPositiveNumber(-1)).toBe(false);
    });

    it('returns false for non-finite numbers', () => {
      expect(isPositiveNumber(Infinity)).toBe(false);
      expect(isPositiveNumber(-Infinity)).toBe(false);
      expect(isPositiveNumber(NaN)).toBe(false);
    });

    it('returns false for non-number values', () => {
      expect(isPositiveNumber('123')).toBe(false);
      expect(isPositiveNumber(null)).toBe(false);
      expect(isPositiveNumber(undefined)).toBe(false);
      expect(isPositiveNumber({})).toBe(false);
    });
  });

  describe('assertString', () => {
    it('does not throw for a valid string', () => {
      expect(() => assertString('ok', 'field')).not.toThrow();
    });

    it('throws for empty/blank string', () => {
      expect(() => assertString('', 'field')).toThrow();
      expect(() => assertString('  ', 'field')).toThrow();
    });

    it('throws for non-string values', () => {
      expect(() => assertString(123, 'field')).toThrow();
      expect(() => assertString(null, 'field')).toThrow();
    });

    it('attaches code and field to the thrown error', () => {
      try {
        assertString('', 'amount');
        throw new Error('should not reach');
      } catch (e) {
        expect((e as Error & { code: string; field: string }).code).toBe('INVALID_STRING');
        expect((e as Error & { field: string }).field).toBe('amount');
        expect((e as Error).message).toBe('amount is required');
      }
    });
  });

  describe('assertPositiveNumber', () => {
    it('does not throw for a valid positive number', () => {
      expect(() => assertPositiveNumber(42, 'price')).not.toThrow();
    });

    it('throws for zero', () => {
      expect(() => assertPositiveNumber(0, 'price')).toThrow();
    });

    it('throws for negative numbers', () => {
      expect(() => assertPositiveNumber(-1, 'price')).toThrow();
    });

    it('throws for non-finite numbers', () => {
      expect(() => assertPositiveNumber(Infinity, 'price')).toThrow();
      expect(() => assertPositiveNumber(NaN, 'price')).toThrow();
    });

    it('throws for non-number values', () => {
      expect(() => assertPositiveNumber('5', 'price')).toThrow();
      expect(() => assertPositiveNumber(null, 'price')).toThrow();
    });

    it('attaches code and field to the thrown error', () => {
      try {
        assertPositiveNumber(-5, 'amount');
        throw new Error('should not reach');
      } catch (e) {
        expect((e as Error & { code: string; field: string }).code).toBe('INVALID_AMOUNT');
        expect((e as Error & { field: string }).field).toBe('amount');
        expect((e as Error).message).toBe('amount must be a positive number');
      }
    });
  });
});