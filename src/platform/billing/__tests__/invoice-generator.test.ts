/**
 * Invoice Generator Tests — Core Generation & Listing
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

describe('Invoice Generator', () => {
  beforeEach(() => {
    setupInvoiceVfs();
  });

  it('should generate invoice with correct fields', async () => {
    const inv = await generateInvoice({ paymentId: 'test-pay-001', email: 'invoice-test@example.com', tier: 'Pro', amount: 149, currency: 'USD' });

    expect(inv.invoiceId).toMatch(/^INV-\d{8}-[A-Z0-9]{4}$/);
    expect(inv.paymentId).toBe('test-pay-001');
    expect(inv.email).toBe('invoice-test@example.com');
    expect(inv.tier).toBe('Pro');
    expect(inv.amount).toBe(149);
    expect(inv.status).toBe('paid');
    expect(inv.issuedAt).toBeTruthy();
  });

  it('should generate unique invoice IDs', async () => {
    const a = await generateInvoice({ paymentId: 'p1', email: 'a@b.com', tier: 'Pro', amount: 49, currency: 'USD' });
    const b = await generateInvoice({ paymentId: 'p2', email: 'a@b.com', tier: 'Pro', amount: 49, currency: 'USD' });
    expect(a.invoiceId).not.toBe(b.invoiceId);
  });

  it('should list invoices', () => {
    const invoices = listInvoices();
    expect(Array.isArray(invoices)).toBe(true);
  });

  it('should return invoice even when email send throws', async () => {
    mockSend.mockRejectedValue(new Error('SendGrid timeout'));

    const inv = await generateInvoice({ paymentId: 'pay-email-fail', email: 'fail@example.com', tier: 'Basic', amount: 10, currency: 'usd' });

    expect(inv.invoiceId).toMatch(/^INV-\d{8}-[A-Z0-9]{4}$/);
    expect(inv.paymentId).toBe('pay-email-fail');
    expect(inv.status).toBe('paid');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should skip corrupt JSON files in listInvoices', () => {
    const validInvoice = {
      invoiceId: 'INV-20260629-ABCD', paymentId: 'pay-ok', email: 'ok@example.com', tier: 'Pro', amount: 99, currency: 'USD', status: 'paid',
      issuedAt: '2026-06-29T10:00:00.000Z', paidAt: '2026-06-29T10:00:00.000Z',
    };
    seedVfs('INV-20260629-ABCD.json', JSON.stringify(validInvoice));
    seedVfs('INV-20260629-CORRUPT.json', '{broken json {{{');

    const invoices = listInvoices();
    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoiceId).toBe('INV-20260629-ABCD');
  });
});
