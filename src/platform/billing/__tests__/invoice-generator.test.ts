import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories — available inside vi.mock() callbacks
// ---------------------------------------------------------------------------
const {
  vfs,
  mockSend,
  mockIsInitialized,
  mockInitialize,
  mockEmailGetInstance,
  mockExistsSync,
  mockReadFileSync,
  mockReaddirSync,
  mockWriteFileSync,
  mockMkdirSync,
} = vi.hoisted(() => ({
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

// ---------------------------------------------------------------------------
// Module mocks (hoisted to top of file by Vitest)
// ---------------------------------------------------------------------------
vi.mock('../../notifications/email-service', () => ({
  EmailService: {
    getInstance: mockEmailGetInstance,
  },
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
}));

import { join } from 'node:path';
import { generateInvoice, listInvoices } from '../invoice-generator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const invoiceDir = join(process.cwd(), 'data', 'invoices');

function seedVfs(filename: string, content: string) {
  vfs.set(join(invoiceDir, filename), content);
}

function defaultReadFileSync(p: unknown): string {
  const pathStr = String(p);
  if (vfs.has(pathStr)) return vfs.get(pathStr)!;
  throw new Error(`ENOENT: ${pathStr}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Invoice Generator', () => {
  beforeEach(() => {
    vfs.clear();
    vi.clearAllMocks();

    // EmailService: happy-path defaults
    mockEmailGetInstance.mockReturnValue({
      isInitialized: mockIsInitialized,
      initialize: mockInitialize,
      send: mockSend,
    });
    mockIsInitialized.mockReturnValue(true);
    mockSend.mockResolvedValue(true);

    // fs: virtual filesystem defaults
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
      [...vfs.keys()]
        .filter((k) => k.includes('invoices'))
        .map((k) => k.split('/').pop()!)
        .filter(Boolean),
    );
  });

  // -----------------------------------------------------------------------
  // Existing tests (unchanged logic, adapted to vfs)
  // -----------------------------------------------------------------------

  it('should generate invoice with correct fields', async () => {
    const inv = await generateInvoice({
      paymentId: 'test-pay-001',
      email: 'invoice-test@example.com',
      tier: 'Pro',
      amount: 149,
      currency: 'USD',
    });

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

  // -----------------------------------------------------------------------
  // New tests — error paths
  // -----------------------------------------------------------------------

  it('should return invoice even when email send throws', async () => {
    mockSend.mockRejectedValue(new Error('SendGrid timeout'));

    const inv = await generateInvoice({
      paymentId: 'pay-email-fail',
      email: 'fail@example.com',
      tier: 'Basic',
      amount: 10,
      currency: 'usd',
    });

    // Invoice must still be returned despite email failure
    expect(inv.invoiceId).toMatch(/^INV-\d{8}-[A-Z0-9]{4}$/);
    expect(inv.paymentId).toBe('pay-email-fail');
    expect(inv.status).toBe('paid');

    // Verify send was attempted (then caught)
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should skip corrupt JSON files in listInvoices', () => {
    // Seed one valid and one corrupt invoice file
    const validInvoice = {
      invoiceId: 'INV-20260629-ABCD',
      paymentId: 'pay-ok',
      email: 'ok@example.com',
      tier: 'Pro',
      amount: 99,
      currency: 'USD',
      status: 'paid',
      issuedAt: '2026-06-29T10:00:00.000Z',
      paidAt: '2026-06-29T10:00:00.000Z',
    };
    seedVfs('INV-20260629-ABCD.json', JSON.stringify(validInvoice));
    seedVfs('INV-20260629-CORRUPT.json', '{broken json {{{');

    const invoices = listInvoices();
    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoiceId).toBe('INV-20260629-ABCD');
  });

  it('should filter invoices by email', () => {
    const aliceInv = {
      invoiceId: 'INV-20260629-A001',
      paymentId: 'pay-a',
      email: 'alice@example.com',
      tier: 'Pro',
      amount: 99,
      currency: 'USD',
      status: 'paid' as const,
      issuedAt: '2026-06-29T10:00:00.000Z',
      paidAt: '2026-06-29T10:00:00.000Z',
    };
    const bobInv = {
      invoiceId: 'INV-20260629-B001',
      paymentId: 'pay-b',
      email: 'bob@example.com',
      tier: 'Basic',
      amount: 10,
      currency: 'EUR',
      status: 'paid' as const,
      issuedAt: '2026-06-29T11:00:00.000Z',
      paidAt: '2026-06-29T11:00:00.000Z',
    };

    seedVfs('INV-20260629-A001.json', JSON.stringify(aliceInv));
    seedVfs('INV-20260629-B001.json', JSON.stringify(bobInv));

    const aliceOnly = listInvoices('alice@example.com');
    expect(aliceOnly).toHaveLength(1);
    expect(aliceOnly[0].email).toBe('alice@example.com');

    const bobOnly = listInvoices('bob@example.com');
    expect(bobOnly).toHaveLength(1);
    expect(bobOnly[0].email).toBe('bob@example.com');

    // No argument returns all
    const all = listInvoices();
    expect(all).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // New tests — escaping & formatting
  // -----------------------------------------------------------------------

  it('should escape HTML special characters in email template', async () => {
    const inv = await generateInvoice({
      paymentId: '<script>alert("xss")</script>',
      email: 'user&test@example.com',
      tier: '"Premium"',
      amount: 199,
      currency: 'USD',
    });

    // The HTML generated and passed to send() must be escaped
    expect(mockSend).toHaveBeenCalledTimes(1);
    const htmlArg: string = mockSend.mock.calls[0][0].html;

    // Raw dangerous sequences must NOT appear in the rendered HTML
    expect(htmlArg).not.toContain('<script>');
    expect(htmlArg).not.toContain('alert("xss")');

    // Escaped equivalents must be present
    expect(htmlArg).toContain('&lt;script&gt;');
    expect(htmlArg).toContain('&quot;xss&quot;');

    // Double-quote in tier name must be escaped
    expect(htmlArg).toContain('&quot;Premium&quot;');

    // The email itself is used as recipient (to), not in HTML body;
    // the raw email on the invoice object is preserved
    expect(inv.email).toBe('user&test@example.com');

    // Invoice is still returned correctly
    expect(inv.paymentId).toBe('<script>alert("xss")</script>');
    expect(inv.email).toBe('user&test@example.com');
  });

  it('should uppercase currency field', async () => {
    const inv = await generateInvoice({
      paymentId: 'pay-curr-001',
      email: 'curr@example.com',
      tier: 'Pro',
      amount: 50,
      currency: 'usd',
    });

    expect(inv.currency).toBe('USD');
  });
});
