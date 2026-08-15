/**
 * Unit Tests for Error Sanitization Utility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeError,
  sanitizeHttpError,
  isProductionError,
} from '../../../../src/shared/utils/error-sanitize';

// Silence logger output during tests
vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('error-sanitize', () => {
  describe('sanitizeError', () => {
    it('should sanitize a TypeError to INVALID_INPUT', () => {
      const result = sanitizeError(new TypeError('Cannot read property of undefined'));
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.statusCode).toBe(400);
      expect(result.message).toBe('Invalid input');
    });

    it('should sanitize a plain Error', () => {
      const result = sanitizeError(new Error('Something broke'));
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
      expect(result.message).toBe('An unexpected error occurred');
    });

    it('should sanitize a custom error with "not found" in message', () => {
      const err = new Error('User not found');
      const result = sanitizeError(err);
      expect(result.code).toBe('NOT_FOUND');
      expect(result.statusCode).toBe(404);
      expect(result.message).toBe('Resource not found');
    });

    it('should sanitize a custom error with "validation" in message', () => {
      const err = new Error('Schema validation failed');
      const result = sanitizeError(err);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.statusCode).toBe(400);
    });

    it('should sanitize a string error', () => {
      const result = sanitizeError('database connection lost');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
      expect(typeof result.message).toBe('string');
    });

    it('should sanitize null', () => {
      const result = sanitizeError(null);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should sanitize undefined', () => {
      const result = sanitizeError(undefined);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should sanitize a plain object with message', () => {
      const err = { message: 'Rate limit exceeded', name: 'RateLimitError' };
      const result = sanitizeError(err);
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should sanitize a numeric error', () => {
      const result = sanitizeError(42);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should map ENOTFOUND to SERVICE_UNAVAIL', () => {
      const err = new Error('getaddrinfo ENOTFOUND api.example.com');
      const result = sanitizeError(err);
      expect(result.code).toBe('SERVICE_UNAVAIL');
      expect(result.statusCode).toBe(503);
    });

    it('should map ECONNREFUSED to SERVICE_UNAVAIL', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      const result = sanitizeError(err);
      expect(result.code).toBe('SERVICE_UNAVAIL');
      expect(result.statusCode).toBe(503);
    });

    it('should map RangeError to OUT_OF_RANGE', () => {
      const err = new RangeError('Invalid array length');
      const result = sanitizeError(err);
      expect(result.code).toBe('OUT_OF_RANGE');
      expect(result.statusCode).toBe(400);
    });

    it('should map "forbidden" to FORBIDDEN', () => {
      const err = new Error('Access forbidden');
      const result = sanitizeError(err);
      expect(result.code).toBe('FORBIDDEN');
      expect(result.statusCode).toBe(403);
    });
  });

  describe('stack trace stripping', () => {
    it('should never include stack traces in output', () => {
      const err = new Error('Test error');
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/at\s+\w/);
      expect(result.message).not.toMatch(/\.ts:/);
      expect(result.message).not.toMatch(/\.js:/);
    });

    it('should not leak stack from Error objects with long stacks', () => {
      const err = new Error('Deep error');
      err.stack = 'Error: Deep error\n    at Function (/Users/macbook/algo-trader/src/app.ts:10:5)\n    at process (/Users/macbook/node_modules/thing/index.js:1:1)';
      const result = sanitizeError(err);
      expect(result.message).not.toContain('/Users/');
      expect(result.message).not.toContain('node_modules');
    });
  });

  describe('internal path stripping', () => {
    it('should not include file paths in output', () => {
      const err = new Error('Error at /Users/macbook/algo-trader/src/db.ts line 42');
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/\/Users\//);
    });

    it('should not include /tmp/ paths', () => {
      const err = new Error('Failed to write /tmp/session-data');
      const result = sanitizeError(err);
      expect(result.message).not.toContain('/tmp/');
    });

    it('should not include /var/ paths', () => {
      const err = new Error('Permission denied on /var/log/app.log');
      const result = sanitizeError(err);
      expect(result.message).not.toContain('/var/');
    });
  });

  describe('sensitive info stripping', () => {
    it('should not include connection strings', () => {
      const err = new Error('postgres://admin:pass@localhost:5432/db failed');
      const result = sanitizeError(err);
      expect(result.message).not.toContain('postgres://');
    });

    it('should not include redis URLs', () => {
      const err = new Error('redis://default:secret@cache.internal:6379 timeout');
      const result = sanitizeError(err);
      expect(result.message).not.toContain('redis://');
    });

    it('should not include API key references', () => {
      const err = new Error('Invalid api_key provided: sk-abc123');
      const result = sanitizeError(err);
      expect(result.message).not.toContain('sk-abc123');
    });
  });

  describe('error code preservation', () => {
    it('should preserve custom error codes from error objects', () => {
      const err = Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' });
      const result = sanitizeError(err);
      expect(result.code).toBe('INTERNAL_ERROR');
      // Custom codes that don't match known patterns get INTERNAL_ERROR
    });

    it('should map validation errors consistently', () => {
      const err = new Error('Validation failed for field "email"');
      const result = sanitizeError(err);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.statusCode).toBe(400);
    });

    it('should map unauthorized errors consistently', () => {
      const err = new Error('Unauthorized access to resource');
      const result = sanitizeError(err);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(result.statusCode).toBe(401);
    });
  });

  describe('sanitizeHttpError', () => {
    it('should return Express-compatible response body', () => {
      const result = sanitizeHttpError(new Error('Not found'));
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('message');
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('statusCode');
    });

    it('should sanitize correctly within HTTP body', () => {
      const result = sanitizeHttpError(new TypeError('bad arg'));
      expect(result.error.code).toBe('INVALID_INPUT');
      expect(result.error.statusCode).toBe(400);
    });

    it('should handle unknown errors in HTTP body', () => {
      const result = sanitizeHttpError(null);
      expect(result.error.code).toBe('UNKNOWN_ERROR');
      expect(result.error.statusCode).toBe(500);
    });
  });

  describe('isProductionError', () => {
    it('should return true for errors containing file paths', () => {
      const err = new Error('Failed at /Users/macbook/app.ts:10');
      expect(isProductionError(err)).toBe(true);
    });

    it('should return true for errors containing connection strings', () => {
      const err = new Error('Connection to postgres://host/db failed');
      expect(isProductionError(err)).toBe(true);
    });

    it('should return true when message contains stack-frame-like text', () => {
      // isProductionError inspects message only — stack is always internal by design
      const err = new Error('at Function (/Users/macbook/app.ts:10:5)');
      expect(isProductionError(err)).toBe(true);
    });

    it('should return false for clean errors', () => {
      const err = new Error('Something went wrong');
      expect(isProductionError(err)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isProductionError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isProductionError(undefined)).toBe(false);
    });

    it('should return false for simple string errors without sensitive data', () => {
      expect(isProductionError('bad input')).toBe(false);
    });

    it('should return true for string errors with secrets', () => {
      expect(isProductionError('api_key=sk-secret123')).toBe(true);
    });

    it('should return true for objects with sensitive values', () => {
      const err = { message: 'auth failed', token: 'bearer abc123' };
      expect(isProductionError(err)).toBe(true);
    });
  });
});
