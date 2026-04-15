import { describe, it, expect } from 'vitest';
import { generateInvoice, listInvoices } from '../invoice-generator';

describe('Invoice Generator', () => {
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
});
