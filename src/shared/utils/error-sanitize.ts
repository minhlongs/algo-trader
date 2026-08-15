/**
 * Error Sanitization Utility
 * Centralized error sanitization — strips internal details, preserves safe codes.
 *
 * Rules:
 * - Never include stack traces, internal paths, or DB connection strings in output
 * - Map common error types to safe generic messages
 * - Preserve error codes for client-side handling
 * - Log full error internally via logger
 */

import { logger } from './logger';

export interface SanitizedError {
  message: string;
  code: string;
  statusCode: number;
}

export interface HttpErrorBody {
  error: {
    message: string;
    code: string;
    statusCode: number;
  };
}

/** Patterns that indicate sensitive info leakage */
const SENSITIVE_PATTERNS = [
  /\/Users\/|\/home\/|\/var\/|\/tmp\/|\/etc\//i,   // file paths
  /password|secret|api[_-]?key|token|credential/i,  // secrets
  /postgres|mysql|mongodb|redis:\/\/|amqp:\/\//i,    // connection strings
  /at\s+\S+\.\w+\s+\(\d+:\d+\)/i,                    // stack trace frames
];

/** Maps error constructor names / message patterns to safe codes.
 *  Order matters: specific system-error patterns first, then generic message patterns. */
const ERROR_CODE_MAP: Array<{ match: RegExp; code: string; status: number; message: string }> = [
  { match: /^TypeError/i,       code: 'INVALID_INPUT',    status: 400, message: 'Invalid input' },
  { match: /^ReferenceError/i,  code: 'INTERNAL_ERROR',  status: 500, message: 'An unexpected error occurred' },
  { match: /^RangeError/i,      code: 'OUT_OF_RANGE',    status: 400, message: 'Value out of acceptable range' },
  { match: /^SyntaxError/i,     code: 'INVALID_INPUT',    status: 400, message: 'Invalid input' },
  { match: /ENOTFOUND/i,        code: 'SERVICE_UNAVAIL',  status: 503, message: 'Service temporarily unavailable' },
  { match: /ECONNREFUSED/i,     code: 'SERVICE_UNAVAIL',  status: 503, message: 'Service temporarily unavailable' },
  { match: /ETIMEOUT/i,         code: 'TIMEOUT',          status: 504, message: 'Request timed out' },
  { match: /ECONNRESET/i,       code: 'CONNECTION_RESET', status: 502, message: 'Connection was reset' },
  { match: /validation/i,       code: 'VALIDATION_ERROR', status: 400, message: 'Validation failed' },
  { match: /unauthorized/i,     code: 'UNAUTHORIZED',     status: 401, message: 'Authentication required' },
  { match: /forbidden/i,        code: 'FORBIDDEN',        status: 403, message: 'Access denied' },
  { match: /not\s*found/i,      code: 'NOT_FOUND',        status: 404, message: 'Resource not found' },
];

/**
 * Extract a safe message and code from an arbitrary error value.
 * Returns the sanitized result AND logs the full error internally.
 */
function classifyError(error: unknown): { message: string; code: string; statusCode: number } {
  // Normalize error to string form
  let rawMessage = '';
  let errorName = '';

  if (error instanceof Error) {
    rawMessage = error.message || error.name;
    errorName = error.name;
  } else if (typeof error === 'string') {
    rawMessage = error;
    errorName = 'Error';
  } else if (error !== null && typeof error === 'object' && 'message' in error) {
    rawMessage = String((error as { message: unknown }).message);
    errorName = (error as { name?: string }).name || 'Error';
  } else {
    return { message: 'An unexpected error occurred', code: 'UNKNOWN_ERROR', statusCode: 500 };
  }

  // Check for mapped error types
  const combined = `${errorName} ${rawMessage}`;
  for (const rule of ERROR_CODE_MAP) {
    if (rule.match.test(combined)) {
      return { message: rule.message, code: rule.code, statusCode: rule.status };
    }
  }

  // Fallback: generic safe message with original code preserved if it looks like a code
  return { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR', statusCode: 500 };
}

/**
 * Sanitize any error value into a safe, client-facing error object.
 *
 * @param error - Any thrown value (Error, string, object, unknown)
 * @param context - Optional label for internal logging (e.g. function name)
 * @returns Safe error object with message, code, and statusCode
 */
export function sanitizeError(
  error: unknown,
  context?: string,
): SanitizedError {
  // Log the full error internally (never exposed to client)
  const logCtx = context ? `[${context}]` : '[error-sanitize]';
  logger.error(`${logCtx} Full error:`, error);

  const result = classifyError(error);

  // Double-check: strip any sensitive patterns that may have slipped into message
  let cleanMessage = result.message;
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(cleanMessage)) {
      cleanMessage = 'An unexpected error occurred';
      break;
    }
  }

  return {
    message: cleanMessage,
    code: result.code,
    statusCode: result.statusCode,
  };
}

/**
 * Sanitize error into Express-compatible JSON response body.
 *
 * @param error - Any thrown value
 * @returns Object with shape: { error: { message, code, statusCode } }
 */
export function sanitizeHttpError(error: unknown): HttpErrorBody {
  const sanitized = sanitizeError(error);
  return { error: sanitized };
}

/**
 * Check if a raw error leaks sensitive information (file paths, connection strings, stack traces).
 * Useful for audit / test assertions.
 *
 * @param error - The original error value to inspect
 * @returns true if the error string contains any sensitive pattern
 */
export function isProductionError(error: unknown): boolean {
  let text = '';

  if (error instanceof Error) {
    // Only check the message — stack always contains internal paths by design
    text = error.message;
  } else if (typeof error === 'string') {
    text = error;
  } else if (error !== null && typeof error === 'object') {
    text = JSON.stringify(error);
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  return false;
}
