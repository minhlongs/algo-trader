/**
 * NOWPayments shared utilities — ported from official SDK.
 * Covers: deep sort, constant-time compare, status normalization, error types, validation.
 * CF Worker compatible (Web Crypto API, no Node.js deps).
 */

// ── Deep Sort (matches SDK ipn.js sortObjectDeep) ──

export function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = sortObjectDeep((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

// ── Constant-Time Comparison (matches SDK timingSafeEqual) ──

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function constantTimeEqual(a: string | Uint8Array, b: string | Uint8Array): boolean {
  const bufA = typeof a === 'string' ? hexToBytes(a) : a;
  const bufB = typeof b === 'string' ? hexToBytes(b) : b;
  if (bufA.length !== bufB.length) return false;
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

// ── Payment Status Normalization (matches SDK normalizers.js) ──

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAID: 'paid',
  PARTIALLY_PAID: 'partially_paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  UNKNOWN: 'unknown',
} as const;

export type NormalizedStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

const STATUS_MAP: Record<string, NormalizedStatus> = {
  waiting: 'pending',
  confirming: 'processing',
  confirmed: 'processing',
  sending: 'processing',
  partially_paid: 'partially_paid',
  finished: 'paid',
  failed: 'failed',
  refunded: 'refunded',
  expired: 'expired',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

export function normalizePaymentStatus(apiStatus: string): NormalizedStatus {
  if (!apiStatus || typeof apiStatus !== 'string') return 'unknown';
  return STATUS_MAP[apiStatus.toLowerCase()] || 'unknown';
}

export const TERMINAL_STATUSES: NormalizedStatus[] = ['paid', 'partially_paid', 'failed', 'refunded', 'expired', 'cancelled'];

export function isTerminalStatus(status: string | NormalizedStatus): boolean {
  return TERMINAL_STATUSES.includes(normalizePaymentStatus(status));
}

// ── Structured Errors (matches SDK errors.js) ──

export type ErrorType = 'configuration' | 'validation' | 'network' | 'api' | 'unknown';

export interface SDKErrorShape {
  error: string;
  type: ErrorType;
  code: string;
  httpStatus: number;
  details?: unknown;
}

export function makeError(message: string, type: ErrorType = 'unknown', code = 'UNEXPECTED_ERROR', httpStatus = 500, details?: unknown): SDKErrorShape {
  return { error: message, type, code, httpStatus, details };
}

export function configError(message: string, code = 'CONFIGURATION_ERROR'): SDKErrorShape {
  return makeError(message, 'configuration', code, 500);
}

export function validationError(message: string, code = 'VALIDATION_ERROR', details?: unknown): SDKErrorShape {
  return makeError(message, 'validation', code, 400, details);
}

export function apiError(message: string, code = 'API_ERROR', httpStatus = 502): SDKErrorShape {
  return makeError(message, 'api', code, httpStatus);
}

// ── Compact Object (matches SDK validators.js compactObject) ──

export function compactObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ── Basic Validators (matches SDK validators.js) ──

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function assertString(value: unknown, fieldName: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw Object.assign(new Error(`${fieldName} is required`), { code: 'INVALID_STRING', field: fieldName });
  }
}

export function assertPositiveNumber(value: unknown, fieldName: string): asserts value is number {
  if (!isPositiveNumber(value)) {
    throw Object.assign(new Error(`${fieldName} must be a positive number`), { code: 'INVALID_AMOUNT', field: fieldName });
  }
}
