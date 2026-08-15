/**
 * Error Response Regression Tests
 *
 * Verifies that sanitizeError / sanitizeHttpError / isProductionError
 * never leak sensitive information (stack traces, internal paths,
 * connection strings, API keys, passwords, secrets, or tokens).
 *
 * No mocks are used for the sanitization functions — tests exercise
 * the real code paths end-to-end. Logger is silenced to keep output clean.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeError,
  sanitizeHttpError,
  isProductionError,
} from '../../../../src/shared/utils/error-sanitize';

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an Error with an explicit stack containing internal paths */
function errorWithStack(message: string, stack: string): Error {
  const err = new Error(message);
  err.stack = stack;
  return err;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('error-response-regression', () => {
  // -----------------------------------------------------------------------
  // 1. Stack traces must never appear in the sanitized message
  // -----------------------------------------------------------------------
  describe('sanitizeError — no stack traces in message', () => {
    it('strips stack from Error objects', () => {
      const err = errorWithStack(
        'Query failed',
        'Error: Query failed\n    at runQuery (/Users/macbook/algo-trader/src/db/query.ts:42:11)\n    at processTicksAndRejections (node:internal/process/task_queues:96:5)',
      );
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/at .+\(/);
      expect(result.message).not.toMatch(/node:internal/);
    });

    it('strips stack from TypeError', () => {
      const err = new TypeError('Cannot read properties of undefined');
      err.stack =
        'TypeError: Cannot read properties of undefined (reading \'id\')\n    at getUser (/Users/macbook/algo-trader/src/api/user.ts:18:12)';
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/at /);
      expect(result.code).toBe('INVALID_INPUT');
    });
  });

  // -----------------------------------------------------------------------
  // 2. Internal file paths must never appear in the sanitized message
  // -----------------------------------------------------------------------
  describe('sanitizeError — no internal file paths', () => {
    it('sanitizes error messages containing absolute Unix paths', () => {
      const err = new Error(
        'ENOENT: no such file or directory, open \'/Users/macbook/algo-trader/src/config/settings.json\'',
      );
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/\/Users\//);
      expect(result.message).not.toMatch(/\/Users\/macbook\/algo-trader/);
    });

    it('sanitizes error messages containing relative paths', () => {
      const err = new Error('Module not found: ./src/internal/module.ts');
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/\.\/src\//);
    });

    it('sanitizes messages with path-like substrings in any position', () => {
      const err = new Error(
        'Failed at /home/deploy/app/src/services/worker.ts line 102',
      );
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/\/home\//);
      expect(result.message).not.toMatch(/\/src\//);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Database connection strings must never appear
  // -----------------------------------------------------------------------
  describe('sanitizeError — no database connection strings', () => {
    it('sanitizes postgres:// URIs with embedded credentials', () => {
      const err = new Error(
        'Connection refused: postgres://admin:s3cret@db.internal:5432/prod',
      );
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/postgres:\/\//);
      expect(result.message).not.toMatch(/s3cret/);
    });

    it('sanitizes mysql:// URIs', () => {
      const err = new Error('Access denied for mysql://root:pass@10.0.0.5/mydb');
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/mysql:\/\//);
    });

    it('sanitizes redis:// URIs', () => {
      const err = new Error(
        'redis://default:hunter2@cache-01.internal:6379 — timeout after 5000ms',
      );
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/redis:\/\//);
      expect(result.message).not.toMatch(/hunter2/);
    });

    it('sanitizes mongodb+srv URIs', () => {
      const err = new Error(
        'MongoNetworkError: connect ECONNREFUSED mongodb+srv://user:pwd@cluster0.abc.mongodb.net',
      );
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/mongodb/);
    });
  });

  // -----------------------------------------------------------------------
  // 4. API keys and tokens must never appear
  // -----------------------------------------------------------------------
  describe('sanitizeError — no API keys or tokens', () => {
    it('sanitizes OpenAI-style sk- keys', () => {
      const err = new Error('Invalid api_key provided: sk-proj-abc123xyz');
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/sk-/);
      expect(result.message).not.toMatch(/api_key/i);
    });

    it('sanitizes bearer tokens', () => {
      const err = new Error('Unauthorized: Bearer eyJhbGciOiJIUzI1NiJ9.signature');
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/Bearer/);
      expect(result.message).not.toMatch(/eyJ/);
    });

    it('sanitizes generic token values in messages', () => {
      const err = new Error('Token expired: tok_abc123def456');
      const result = sanitizeError(err);
      expect(result.message).not.toMatch(/tok_/);
    });
  });

  // -----------------------------------------------------------------------
  // 5. sanitizeHttpError — safe HTTP-compatible body
  // -----------------------------------------------------------------------
  describe('sanitizeHttpError — safe HTTP body', () => {
    it('returns object with error.message, error.code, error.statusCode', () => {
      const body = sanitizeHttpError(new Error('Not found'));
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('statusCode');
      expect(typeof body.error.message).toBe('string');
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.statusCode).toBe('number');
    });

    it('HTTP body never contains stack traces', () => {
      const err = errorWithStack(
        'Internal failure',
        'Error: Internal failure\n    at /Users/macbook/algo-trader/src/handler.ts:55:3',
      );
      const body = sanitizeHttpError(err);
      expect(JSON.stringify(body)).not.toMatch(/at .+\(/);
      expect(JSON.stringify(body)).not.toMatch(/\/Users\//);
    });

    it('maps TypeError to 400 with INVALID_INPUT', () => {
      const body = sanitizeHttpError(new TypeError('bad param'));
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(body.error.statusCode).toBe(400);
    });

    it('maps RangeError to 400 with OUT_OF_RANGE', () => {
      const body = sanitizeHttpError(new RangeError('Maximum call stack size exceeded'));
      expect(body.error.code).toBe('OUT_OF_RANGE');
      expect(body.error.statusCode).toBe(400);
    });

    it('handles null input gracefully', () => {
      const body = sanitizeHttpError(null);
      expect(body.error.code).toBe('UNKNOWN_ERROR');
      expect(body.error.statusCode).toBe(500);
    });

    it('handles undefined input gracefully', () => {
      const body = sanitizeHttpError(undefined);
      expect(body.error.code).toBe('UNKNOWN_ERROR');
      expect(body.error.statusCode).toBe(500);
    });

    it('handles string input gracefully', () => {
      const body = sanitizeHttpError('something broke');
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.statusCode).toBe(500);
    });

    it('handles object-with-message input gracefully', () => {
      const body = sanitizeHttpError({
        message: 'Rate limit exceeded',
        name: 'RateLimitError',
      });
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.statusCode).toBe(500);
    });

    it('never leaks sensitive keywords in the HTTP body', () => {
      const body = sanitizeHttpError(new Error('password reset failed for token xyz'));
      const json = JSON.stringify(body);
      expect(json).not.toMatch(/password/i);
      expect(json).not.toMatch(/token/i);
    });
  });

  // -----------------------------------------------------------------------
  // 6. isProductionError — detects unsafe errors
  // -----------------------------------------------------------------------
  describe('isProductionError — detects unsafe errors', () => {
    it('returns true for error messages with file paths', () => {
      expect(isProductionError(new Error('ENOENT at /Users/macbook/app/src/index.ts'))).toBe(true);
    });

    it('returns true for error messages with connection strings', () => {
      expect(isProductionError(new Error('postgres://admin:pw@host/db failed'))).toBe(true);
    });

    it('returns true for error messages with stack-like patterns', () => {
      expect(
        isProductionError(new Error('at Function (/Users/macbook/app.ts:10:5)')),
      ).toBe(true);
    });

    it('returns true for strings containing sensitive keywords', () => {
      expect(isProductionError('api_key=sk-secret123')).toBe(true);
      expect(isProductionError('password is required')).toBe(true);
    });

    it('returns true for objects with sensitive values', () => {
      expect(isProductionError({ message: 'auth failed', token: 'bearer abc123' })).toBe(true);
    });

    it('returns false for clean error messages', () => {
      expect(isProductionError(new Error('Something went wrong'))).toBe(false);
      expect(isProductionError('bad input')).toBe(false);
    });

    it('returns false for null and undefined', () => {
      expect(isProductionError(null)).toBe(false);
      expect(isProductionError(undefined)).toBe(false);
    });

    it('returns false for numeric errors', () => {
      expect(isProductionError(42)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Various error types — sanitization coverage
  // -----------------------------------------------------------------------
  describe('sanitizeError — handles all error types', () => {
    it('sanitizes TypeError', () => {
      const result = sanitizeError(new TypeError('Cannot read property of undefined'));
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.statusCode).toBe(400);
      expect(result.message).toBe('Invalid input');
    });

    it('sanitizes RangeError', () => {
      const result = sanitizeError(new RangeError('Invalid array length'));
      expect(result.code).toBe('OUT_OF_RANGE');
      expect(result.statusCode).toBe(400);
      expect(result.message).toBe('Value out of acceptable range');
    });

    it('sanitizes custom AppError subclass', () => {
      class AppError extends Error {
        constructor(message: string, public statusCode = 500) {
          super(message);
          this.name = 'AppError';
        }
      }
      const result = sanitizeError(new AppError('Payment gateway timeout', 502));
      // Unknown error subclass — falls through to INTERNAL_ERROR
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('sanitizes unknown string input', () => {
      const result = sanitizeError('disk quota exceeded');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('sanitizes null input', () => {
      const result = sanitizeError(null);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('sanitizes object with stack property (non-Error)', () => {
      const result = sanitizeError({
        message: 'something failed',
        stack: 'Error: something failed\n    at /internal/worker.ts:10',
      });
      // Object-with-message path
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.message).not.toMatch(/\/internal\//);
    });

    it('sanitizes unknown numeric value', () => {
      const result = sanitizeError(404);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.statusCode).toBe(500);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Error code preservation — codes survive sanitization
  // -----------------------------------------------------------------------
  describe('error code preservation', () => {
    it('preserves INVALID_INPUT for TypeError', () => {
      const result = sanitizeError(new TypeError('bad argument'));
      expect(result.code).toBe('INVALID_INPUT');
    });

    it('preserves OUT_OF_RANGE for RangeError', () => {
      const result = sanitizeError(new RangeError('index out of bounds'));
      expect(result.code).toBe('OUT_OF_RANGE');
    });

    it('preserves VALIDATION_ERROR for validation messages', () => {
      const result = sanitizeError(new Error('Schema validation failed for email'));
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('preserves NOT_FOUND for "not found" messages', () => {
      const result = sanitizeError(new Error('User not found'));
      expect(result.code).toBe('NOT_FOUND');
    });

    it('preserves INTERNAL_ERROR for generic Error', () => {
      const result = sanitizeError(new Error('Something broke'));
      expect(result.code).toBe('INTERNAL_ERROR');
    });

    it('preserves UNKNOWN_ERROR for null input', () => {
      const result = sanitizeError(null);
      expect(result.code).toBe('UNKNOWN_ERROR');
    });

    it('preserves FORBIDDEN for forbidden messages', () => {
      const result = sanitizeError(new Error('Access forbidden'));
      expect(result.code).toBe('FORBIDDEN');
    });
  });

  // -----------------------------------------------------------------------
  // 9. Errors containing sensitive keywords are sanitized
  // -----------------------------------------------------------------------
  describe('sanitizeError — sensitive keyword sanitization', () => {
    it('sanitizes messages containing "password"', () => {
      const result = sanitizeError(new Error('invalid password provided'));
      expect(result.message).not.toMatch(/password/i);
      expect(result.message).toBe('An unexpected error occurred');
    });

    it('sanitizes messages containing "secret"', () => {
      const result = sanitizeError(new Error('secret key mismatch'));
      expect(result.message).not.toMatch(/secret/i);
    });

    it('sanitizes messages containing "token"', () => {
      const result = sanitizeError(new Error('expired token abc123'));
      expect(result.message).not.toMatch(/token/i);
    });

    it('sanitizes messages containing "api_key"', () => {
      const result = sanitizeError(new Error('invalid api_key sk-xyz'));
      expect(result.message).not.toMatch(/api_key/i);
      expect(result.message).not.toMatch(/sk-/);
    });

    it('sanitizes messages containing "apikey"', () => {
      const result = sanitizeError(new Error('apikey does not exist'));
      expect(result.message).not.toMatch(/apikey/i);
    });

    it('sanitizes messages combining multiple sensitive keywords', () => {
      const result = sanitizeError(
        new Error('Failed to authenticate: password expired, token revoked, api_key=deadbeef'),
      );
      expect(result.message).not.toMatch(/password/i);
      expect(result.message).not.toMatch(/token/i);
      expect(result.message).not.toMatch(/api_key/i);
    });
  });
});
