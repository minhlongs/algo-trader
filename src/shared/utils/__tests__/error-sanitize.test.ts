import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeError,
  sanitizeHttpError,
  isProductionError,
} from '../error-sanitize';

// Mock logger to avoid noise in test output
vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('error-sanitize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeHttpError', () => {
    it('strips stack traces from Error objects', () => {
      const err = new Error('database connection failed');
      err.stack = 'Error: database connection failed\n    at connect (src/db/client.ts:42:15)\n    at Pool.query (src/db/pool.ts:88:20)';

      const body = sanitizeHttpError(err);

      // Stack trace must never appear in output
      expect(JSON.stringify(body)).not.toContain('src/db/client.ts');
      expect(JSON.stringify(body)).not.toContain('at connect');
      expect(JSON.stringify(body)).not.toContain('Pool.query');
    });

    it('preserves error message for client handling', () => {
      const err = new TypeError('invalid argument');

      const body = sanitizeHttpError(err);

      expect(body.error.message).toBe('Invalid input');
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(body.error.statusCode).toBe(400);
    });

    it('maps unknown errors to safe generic message', () => {
      const err = new Error('something broke internally');

      const body = sanitizeHttpError(err);

      // Generic message — never the raw internal text
      expect(body.error.message).not.toBe('something broke internally');
      expect(body.error.statusCode).toBe(500);
    });

    it('handles string errors safely — strips connection strings', () => {
      const body = sanitizeHttpError('postgres://admin:secret@db.internal:5432/prod');

      expect(JSON.stringify(body)).not.toContain('postgres://');
      expect(JSON.stringify(body)).not.toContain('secret');
      expect(body.error.message).toBeDefined();
    });

    it('handles null/undefined errors without crashing', () => {
      expect(() => sanitizeHttpError(null)).not.toThrow();
      expect(() => sanitizeHttpError(undefined)).not.toThrow();
      expect(() => sanitizeHttpError(42)).not.toThrow();
    });

    it('never exposes internal file paths', () => {
      const err = new Error('fail');
      err.stack = 'Error: fail\n    at /home/deploy/src/internal/secret.ts:99\n    at processRequest (src/handlers/private.ts:12)';

      const body = sanitizeHttpError(err);
      const json = JSON.stringify(body);

      expect(json).not.toContain('/home/deploy/');
      expect(json).not.toContain('secret.ts');
      expect(json).not.toContain('private.ts');
    });
  });

  describe('sanitizeError', () => {
    it('returns SanitizedError with message, code, statusCode', () => {
      const result = sanitizeError(new RangeError('out of bounds'));

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('statusCode');
      expect(result.code).toBe('OUT_OF_RANGE');
      expect(result.statusCode).toBe(400);
    });

    it('truncates overly long error messages', () => {
      const longMsg = 'x'.repeat(500);
      const err = new Error(longMsg);

      const result = sanitizeError(err);

      expect(result.message.length).toBeLessThanOrEqual(200);
    });
  });

  describe('isProductionError', () => {
    it('ignores stack traces — only checks message (by design)', () => {
      // isProductionError intentionally inspects message only;
      // stack always contains internal paths by design (see source comment)
      const err = new Error('fail');
      err.stack = 'Error: fail\n    at /src/secret.ts:10';

      expect(isProductionError(err)).toBe(false);
    });

    it('detects sensitive patterns in error messages', () => {
      // SENSITIVE_PATTERNS: password|secret|api[_-]?key|token|credential|postgres|...
      expect(isProductionError(new Error('password is required'))).toBe(true);
      expect(isProductionError(new Error('apikey is invalid'))).toBe(true);
      expect(isProductionError(new Error('api_key missing'))).toBe(true);
      expect(isProductionError(new Error('postgres://user:pass@host/db'))).toBe(true);
    });

    it('detects connection strings as sensitive', () => {
      expect(isProductionError('postgres://admin:password@db.internal:5432/prod')).toBe(true);
    });

    it('allows clean error messages', () => {
      expect(isProductionError('Invalid input')).toBe(false);
    });
  });
});
