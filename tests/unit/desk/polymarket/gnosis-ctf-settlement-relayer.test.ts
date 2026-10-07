import { describe, it, expect } from 'vitest';
import { GnosisCtfSettlementRelayer } from '../../../../src/desk/polymarket/gnosis-ctf-settlement-relayer';
import type { ConditionPayoutReport } from '../../../../src/desk/polymarket/gnosis-ctf-settlement-types';

describe('GnosisCtfSettlementRelayer', () => {
  const relayerAddress = '0x1234567890123456789012345678901234567890';
  let relayer: GnosisCtfSettlementRelayer;

  beforeEach(() => {
    relayer = new GnosisCtfSettlementRelayer(relayerAddress, 5);
  });

  it('calculates payout accurately for binary resolved condition', () => {
    const report: ConditionPayoutReport = {
      conditionId: 'cond-1',
      questionId: 'q-1',
      outcomeSlotCount: 2,
      payoutNumerators: [1, 0], // YES won
      payoutDenominator: 1,
      isResolved: true,
      resolvedAt: Date.now(),
    };

    relayer.registerCondition(report);

    // Holding 100 YES shares (indexSet 1 = 1 << 0)
    const payoutYes = relayer.calculatePayout({
      conditionId: 'cond-1',
      indexSet: 1,
      shares: 100,
    });
    expect(payoutYes).toBe(100);

    // Holding 100 NO shares (indexSet 2 = 1 << 1)
    const payoutNo = relayer.calculatePayout({
      conditionId: 'cond-1',
      indexSet: 2,
      shares: 100,
    });
    expect(payoutNo).toBe(0);
  });

  it('executes atomic redemption with incrementing nonce', async () => {
    const report: ConditionPayoutReport = {
      conditionId: 'cond-2',
      questionId: 'q-2',
      outcomeSlotCount: 2,
      payoutNumerators: [1, 0],
      payoutDenominator: 1,
      isResolved: true,
    };
    relayer.registerCondition(report);

    const res = await relayer.executeRedemption({
      conditionId: 'cond-2',
      indexSet: 1,
      shares: 50,
    });

    expect(res).not.toBeNull();
    expect(res?.collateralAmountReceivedUsd).toBe(50);
    expect(res?.nonceUsed).toBe(6); // initial was 5, incremented to 6
    expect(res?.txHash).toMatch(/^0xmock/);
  });
});
