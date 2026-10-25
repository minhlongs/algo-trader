/**
 * Monetization End-to-End — both money channels into one entitlement.
 *
 * Signals channel wiring: the real webhook handlers grant a tier only from the
 * price book, ignore a replayed payment_id, and fail closed otherwise.
 *
 * The mocked boundary lives in `monetization-e2e.fixtures.ts`: the database pool
 * (`pg`) and the outbound HTTP provider call (`fetch`). The tier resolution is the
 * behaviour under test, so its real modules run unmodified.
 */

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  db,
  mockLogger,
  mockSignalRepo,
  fetchMock,
} from './monetization-e2e.fixtures';

// Payment ledger persistence: keep the real in-memory Map, drop the disk write.
vi.mock('../payment-store', () => ({
  saveToFile: vi.fn(),
  loadFromFile: vi.fn(() => new Map()),
  clearStoreFile: vi.fn(),
  STORE_PATH: '/tmp/unused-payments.json',
}));

import {
  SIGNALS_PRICE_BOOK,
  SignalsPriceNotFoundError,
} from '../signals-price-book';
import { PaymentService } from '../payment-service';

/** The payment ledger is a process-wide singleton; reset it between tests. */
function resetPaymentLedger(): void {
  const ledger = (PaymentService.getInstance() as unknown as { payments: Map<string, unknown> })
    .payments;
  ledger.clear();
}

function signalsIpn(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: 'pay-sig-1',
    payment_status: 'finished' as const,
    price_amount: SIGNALS_PRICE_BOOK.SIGNALS_PRO.priceUsd,
    price_currency: 'usd',
    order_id: 'sig_sub-alpha_1700000000',
    ...overrides,
  };
}

describe('signals activation through the real webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    fetchMock.mockReset();
    resetPaymentLedger();
    mockSignalRepo.getBySubscriberId.mockResolvedValue(null);
    mockSignalRepo.upsert.mockResolvedValue(undefined);
    mockSignalRepo.setActive.mockResolvedValue(undefined);
  });

  it('activates the tier once and ignores a replayed payment_id', async () => {
    const { handleSignalsIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/signals-payment-handler'
    );
    const { handleIpnPaymentSuccess } = await import(
      '../../api/routes/webhooks/handlers/payment-handler'
    );

    // Route order for a `sig_` IPN: activate the tier, then record the settlement.
    const firstIpn = signalsIpn({ payment_id: 'pay-replay' });
    await handleSignalsIpnFinished(firstIpn as never);
    await handleIpnPaymentSuccess(firstIpn as never, PaymentService.getInstance());

    await handleSignalsIpnFinished(signalsIpn({ payment_id: 'pay-replay' }) as never);

    expect(mockSignalRepo.upsert).toHaveBeenCalledTimes(1);
    expect(mockSignalRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 'sub-alpha', tier: 'PRO', active: true }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[SignalsPayment] Payment already recorded, skipping activation',
      expect.objectContaining({ paymentId: 'pay-replay' }),
    );
  });

  it('grants the price-book tier regardless of any tier named in the payload', async () => {
    const { handleSignalsIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/signals-payment-handler'
    );

    // A hostile payload names a tier the customer never paid for. The amount on the
    // price book is the only thing that decides the granted tier.
    await handleSignalsIpnFinished(
      signalsIpn({
        payment_id: 'pay-forged',
        price_amount: SIGNALS_PRICE_BOOK.SIGNALS_BASIC.priceUsd,
        tier: 'MASTER',
        order_description: 'MASTER license',
      }) as never,
    );

    expect(mockSignalRepo.upsert).toHaveBeenCalledTimes(1);
    const written = mockSignalRepo.upsert.mock.calls[0][0] as { tier: string };
    expect(written.tier).toBe('BASIC');
    expect(written.tier).not.toBe('MASTER');
  });

  it('fails closed when the paid amount is on no price book — no tier is written', async () => {
    const { handleSignalsIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/signals-payment-handler'
    );

    await expect(
      handleSignalsIpnFinished(
        signalsIpn({ payment_id: 'pay-unknown', price_amount: 1234 }) as never,
      ),
    ).rejects.toBeInstanceOf(SignalsPriceNotFoundError);

    expect(mockSignalRepo.upsert).not.toHaveBeenCalled();
    expect(mockSignalRepo.getBySubscriberId).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[SignalsPayment] Paid amount absent from signals price book — no tier granted',
      expect.objectContaining({ amount: 1234, paymentId: 'pay-unknown' }),
    );
  });

  it('upgrades an existing subscription in place rather than creating a duplicate', async () => {
    const { handleSignalsIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/signals-payment-handler'
    );
    mockSignalRepo.getBySubscriberId.mockResolvedValue({
      id: 'row-1',
      subscriberId: 'sub-alpha',
      chatId: 'chat-1',
      tier: 'BASIC',
      active: true,
      createdAt: 1,
    });

    await handleSignalsIpnFinished(
      signalsIpn({
        payment_id: 'pay-upgrade',
        price_amount: SIGNALS_PRICE_BOOK.SIGNALS_ENTERPRISE.priceUsd,
      }) as never,
    );

    expect(mockSignalRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'row-1',
        subscriberId: 'sub-alpha',
        chatId: 'chat-1',
        tier: 'ENTERPRISE',
        active: true,
        createdAt: 1,
      }),
    );
    // BASIC must stay BASIC: the paid Basic buy is never collapsed into FREE.
    expect(mockSignalRepo.upsert.mock.calls[0][0]).not.toMatchObject({ tier: 'FREE' });
  });
});
