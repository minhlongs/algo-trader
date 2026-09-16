/**
 * Shared fixtures for crypto tests.
 */
// 64-char hex string = 32 bytes
export const FIXTURE_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);
export const FIXTURE_TENANT = 'tenant-123';
export const FIXTURE_FIELD = 'apiKey';
