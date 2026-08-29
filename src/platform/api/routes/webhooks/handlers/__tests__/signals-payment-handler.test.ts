/**
 * Tests for signals-payment-handler — handleSignalsIpnFinished and
 * handleSignalsIpnCancelled.
 *
 * Drives the order_id parsing, unrecognized-amount and missing-subscriberId
 * early returns, the existing-vs-new upsert branches for each tier, and the
 * deactivation path. signalSubscriberRepo and logger are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLogger,
  mockGetBySubscriberId,
  mockUpsert,
  mockSetActive,
  mockNowPaymentsService,
} = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockGetBySubscriberId: vi.fn(),
  mockUpsert: vi.fn(),
  mockSetActive: vi.fn(),
  mockNowPaymentsService: { activate: vi.fn() },
}));

vi.mock('../../../../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../../../signal/signal-subscriber-repository-d1', () => ({
  signalSubscriberRepo: {
    getBySubscriberId: mockGetBySubscriberId,
    upsert: mockUpsert,
    setActive: mockSetActive,
  },
}));
vi.mock('../../../../../billing/nowpayments-service', () => ({
  NowPaymentsService: mockNowPaymentsService,
  NowPaymentsIpnPayload: {},
}));

import {
  handleSignalsIpnFinished,
  handleSignalsIpnCancelled,
} from '../signals-payment-handler';

function ipn(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: 'pay-1',
    payment_status: 'finished',
    price_amount: 99,
    price_currency: 'usd',
    order_id: 'sig_sub-1_1700000000',
    ...overrides,
  } as any;
}

describe('handleSignalsIpnFinished', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when the order_id has no subscriberId', async () => {
    await handleSignalsIpnFinished(ipn({ order_id: 'no-underscore-here' }));
    expect(mockGetBySubscriberId).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[SignalsPayment] No subscriberId in order_id',
      expect.objectContaining({ orderId: 'no-underscore-here' }),
    );
  });

  it('returns early when the order_id is missing entirely', async () => {
    await handleSignalsIpnFinished(ipn({ order_id: undefined }));
    expect(mockGetBySubscriberId).not.toHaveBeenCalled();
  });

  it('warns and returns when the payment amount is unrecognized', async () => {
    await handleSignalsIpnFinished(ipn({ price_amount: 7 }));
    expect(mockGetBySubscriberId).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[SignalsPayment] Unrecognized payment amount',
      expect.objectContaining({ amount: 7, paymentId: 'pay-1' }),
    );
  });

  it('maps $29 -> BASIC (FREE delivery tier)', async () => {
    mockGetBySubscriberId.mockResolvedValue(null);
    await handleSignalsIpnFinished(ipn({ price_amount: 29, order_id: 'sig_sub-9_1' }));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 'sub-9', tier: 'FREE' }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[SignalsPayment] Subscription created',
      expect.objectContaining({ subscriberId: 'sub-9', tier: 'FREE' }),
    );
  });

  it('upgrades an existing subscription to PRO on a $99 payment', async () => {
    mockGetBySubscriberId.mockResolvedValue({
      id: 'row-1',
      subscriberId: 'sub-1',
      chatId: 'chat-1',
      tier: 'FREE',
      active: true,
      createdAt: 1,
    });
    await handleSignalsIpnFinished(ipn({ price_amount: 99 }));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'row-1',
        subscriberId: 'sub-1',
        chatId: 'chat-1',
        tier: 'PRO',
        active: true,
        createdAt: 1,
        updatedAt: expect.any(Number),
      }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[SignalsPayment] Subscription upgraded',
      expect.objectContaining({ subscriberId: 'sub-1', tier: 'PRO' }),
    );
  });

  it('creates a fresh subscription for ENTERPRISE when none exists', async () => {
    mockGetBySubscriberId.mockResolvedValue(null);
    await handleSignalsIpnFinished(ipn({ price_amount: 299, order_id: 'sig_sub-5_2' }));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberId: 'sub-5',
        tier: 'ENTERPRISE',
        active: true,
        chatId: undefined,
      }),
    );
  });
});

describe('handleSignalsIpnCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when there is no subscriberId', async () => {
    await handleSignalsIpnCancelled(ipn({ order_id: 'bad' }));
    expect(mockGetBySubscriberId).not.toHaveBeenCalled();
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[SignalsPayment] No subscriberId in order_id for cancellation',
      expect.objectContaining({ orderId: 'bad' }),
    );
  });

  it('deactivates an existing subscription and logs the cancellation', async () => {
    mockGetBySubscriberId.mockResolvedValue({ id: 'row-1', subscriberId: 'sub-1' });
    await handleSignalsIpnCancelled(ipn({ order_id: 'sig_sub-1_1', payment_status: 'refunded' }));
    expect(mockSetActive).toHaveBeenCalledWith('sub-1', false);
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[SignalsPayment] Subscription cancelled',
      expect.objectContaining({ subscriberId: 'sub-1', status: 'refunded' }),
    );
  });

  it('is a no-op when no subscription exists', async () => {
    mockGetBySubscriberId.mockResolvedValue(null);
    await handleSignalsIpnCancelled(ipn({ order_id: 'sig_sub-7_1' }));
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});