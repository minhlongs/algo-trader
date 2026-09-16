/**
 * Invoice Generator Tests — Filtering, HTML Escaping, Currency Formatting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { vfs, mockSend, mockIsInitialized, mockInitialize, mockEmailGetInstance, mockExistsSync, mockReadFileSync, mockReaddirSync, mockWriteFileSync, mockMkdirSync } =
  vi.hoisted(() => ({
    vfs: new Map<string, string>(),
    mockSend: vi.fn(),
    mockIsInitialized: vi.fn(() => true),
    mockInitialize: vi.fn(),
    mockEmailGetInstance: vi.fn(),
    mockExistsSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockReaddirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockMkdirSync: vi.fn(),
  }));

vi.mock('../../notifications/email-service', () => ({
  EmailService: { getInstance: mockEmailGetInstance },
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
}));

import { generateInvoice, listInvoices } from '../invoice-generator';
import { makeSeedVfs, makeDefaultReadFileSync } from './invoice-generator-fixtures';

const seedVfs = makeSeedVfs(vfs);
const defaultReadFileSync = makeDefaultReadFileSync(vfs);

function setupInvoiceVfs() {
  vfs.clear();
  vi.clearAllMocks();

  mockEmailGetInstance.mockReturnValue({ isInitialized: mockIsInitialized, initialize: mockInitialize, send: mockSend });
  mockIsInitialized.mockReturnValue(true);
  mockSend.mockResolvedValue(true);

  mockExistsSync.mockImplementation((p: unknown) => {
    const s = String(p);
    return s.endsWith('invoices') || vfs.has(s);
  });
  mockMkdirSync.mockImplementation(() => {});
  mockWriteFileSync.mockImplementation((p: unknown, data: string) => {
    vfs.set(String(p), String(data));
  });
  mockReadFileSync.mockImplementation(defaultReadFileSync);
  mockReaddirSync.mockImplementation(() =>
    [...vfs.keys()].filter((k) => k.includes('invoices')).map((k) => k.split('/').pop()!).filter(Boolean),
  );
}

describe('Invoice Generator - Formatting', () => {
  beforeEach(() => {
    setupInvoiceVfs();
  });

  it('should filter invoices by email', () => {
    const aliceInv = {
      invoiceId: 'INV-20260629-A001', paymentId: 'pay-a', email: 'alice@example.com', tier: 'Pro', amount: 99, currency: 'USD', status: 'paid' as const,
      issuedAt: '2026-06-29T10:00:00.000Z', paidAt: '2026-06-29T10:00:00.000Z',
    };
    const bobInv = {
      invoiceId: 'INV-20260629-B001', paymentId: 'pay-b', email: 'bob@example.com', tier: 'Basic', amount: 10, currency: 'EUR', status: 'paid' as const,
      issuedAt: '2026-06-29T11:00:00.000Z', paidAt: '2026-06-29T11:00:00.000Z',
    };

    seedVfs('INV-20260629-A001.json', JSON.stringify(aliceInv));
    seedVfs('INV-20260629-B001.json', JSON.stringify(bobInv));

    const aliceOnly = listInvoices('alice@example.com');
    expect(aliceOnly).toHaveLength(1);
    expect(aliceOnly[0].email).toBe('alice@example.com');

    const bobOnly = listInvoices('bob@example.com');
    expect(bobOnly).toHaveLength(1);
    expect(bobOnly[0].email).toBe('bob@example.com');

    const all = listInvoices();
    expect(all).toHaveLength(2);
  });

  it('should escape HTML special characters in email template', async () => {
    const inv = await generateInvoice({
      paymentId: '<script>alert("xss")</script>',
      email: 'user&test@example.com',
      tier: '"Premium"',
      amount: 199,
      currency: 'USD',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const htmlArg: string = mockSend.mock.calls[0][0].html;

    expect(htmlArg).not.toContain('<script>');
    expect(htmlArg).not.toContain('alert("xss")');
    expect(htmlArg).toContain('&lt;script&gt;');
    expect(htmlArg).toContain('&quot;xss&quot;');
    expect(htmlArg).toContain('&quot;Premium&quot;');
    expect(inv.email).toBe('user&test@example.com');
    expect(inv.paymentId).toBe('<script>alert("xss")</script>');
    expect(inv.email).toBe('user&test@example.com');
  });

  it('should uppercase currency field', async () => {
    const inv = await generateInvoice({ paymentId: 'pay-curr-001', email: 'curr@example.com', tier: 'Pro', amount: 50, currency: 'usd' });
    expect(inv.currency).toBe('USD');
  });
});
