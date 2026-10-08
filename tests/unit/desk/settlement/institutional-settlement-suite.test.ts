import { describe, it, expect } from 'vitest';
import { FixProtocolEngine } from '../../../../src/desk/settlement/fix-protocol-engine';
import { BlockAllocationEngine } from '../../../../src/desk/settlement/block-allocation-engine';
import { ClearingReconciliationEngine } from '../../../../src/desk/settlement/clearing-reconciliation-engine';

describe('Institutional Settlement & Post-Trade Allocation Suite', () => {
  describe('FixProtocolEngine', () => {
    it('serializes a FIX message and parses it back with valid checksum', () => {
      const originalMsg = {
        msgType: 'D', // New Order Single
        senderCompId: 'DESK_ALPHA',
        targetCompId: 'CME_CLEARING',
        msgSeqNum: 1042,
        sendingTime: '20261008-12:00:00.000',
        fields: [
          { tag: 11, value: 'CLORD123' }, // ClOrdID
          { tag: 55, value: 'ESZ6' },     // Symbol
          { tag: 54, value: '1' },        // Side (Buy)
          { tag: 38, value: '50' },       // OrderQty
          { tag: 40, value: '2' },        // OrdType (Limit)
          { tag: 44, value: '5850.25' },  // Price
        ],
      };

      const serialized = FixProtocolEngine.serialize(originalMsg);
      expect(serialized).toContain('8=FIX.4.4\x01');
      expect(serialized).toContain('35=D\x01');
      expect(serialized).toContain('11=CLORD123\x01');
      expect(serialized).toContain('10=');

      const parsed = FixProtocolEngine.parse(serialized);
      expect(parsed.msgType).toBe('D');
      expect(parsed.senderCompId).toBe('DESK_ALPHA');
      expect(parsed.targetCompId).toBe('CME_CLEARING');
      expect(parsed.msgSeqNum).toBe(1042);
      expect(parsed.sendingTime).toBe('20261008-12:00:00.000');
      expect(parsed.fields.find(f => f.tag === 55)?.value).toBe('ESZ6');
      expect(parsed.fields.find(f => f.tag === 44)?.value).toBe('5850.25');
    });

    it('detects corrupted checksum in incoming FIX message', () => {
      const validMsg = FixProtocolEngine.serialize({
        msgType: '8', // Execution Report
        senderCompId: 'EXCH',
        targetCompId: 'DESK',
        msgSeqNum: 1,
        sendingTime: '20261008-12:00:00.000',
        fields: [{ tag: 150, value: '0' }],
      });

      // Corrupt checksum
      const corrupted = validMsg.replace(/10=\d{3}/, '10=999');
      expect(() => FixProtocolEngine.parse(corrupted)).toThrow('Checksum mismatch');
    });
  });

  describe('BlockAllocationEngine', () => {
    it('computes block VWAP and allocates discrete shares to target accounts without residual loss', () => {
      const engine = new BlockAllocationEngine();

      const fills = [
        { fillId: 'f1', symbol: 'NVDA', side: 'BUY' as const, price: 120.0, quantity: 300, timestampMs: 1000, venueExecutionId: 'v1' },
        { fillId: 'f2', symbol: 'NVDA', side: 'BUY' as const, price: 125.0, quantity: 200, timestampMs: 2000, venueExecutionId: 'v2' },
        { fillId: 'f3', symbol: 'NVDA', side: 'BUY' as const, price: 130.0, quantity: 500, timestampMs: 3000, venueExecutionId: 'v3' },
      ];

      // Total quantity: 1,000. Total notional: (300*120 + 200*125 + 500*130) = 36000 + 25000 + 65000 = 126,000 -> VWAP = 126.0
      const { totalQuantity, averagePrice } = engine.computeBlockVwap(fills);
      expect(totalQuantity).toBe(1000);
      expect(averagePrice).toBe(126.0);

      const targets = [
        { accountId: 'FUND_ALPHA', percentageBasis: 0.3333, designatedCapacity: 'AGENCY' as const },
        { accountId: 'FUND_BETA', percentageBasis: 0.3333, designatedCapacity: 'AGENCY' as const },
        { accountId: 'FUND_GAMMA', percentageBasis: 0.3334, designatedCapacity: 'AGENCY' as const },
      ];

      const allocations = engine.allocateBlockTrade('BLOCK-101', fills, targets);
      expect(allocations.length).toBe(3);

      const totalAllocatedShares = allocations.reduce((sum, a) => sum + a.allocatedQuantity, 0);
      expect(totalAllocatedShares).toBe(1000); // Zero share leakage

      expect(allocations[0]?.targetAccountId).toBe('FUND_ALPHA');
      expect(allocations[0]?.allocatedQuantity).toBeGreaterThanOrEqual(333);
      expect(allocations[0]?.averageExecutionPrice).toBe(126.0);
    });

    it('rejects allocation targets that do not sum to 100%', () => {
      const engine = new BlockAllocationEngine();
      const fills = [{ fillId: 'f1', symbol: 'AAPL', side: 'BUY' as const, price: 200, quantity: 100, timestampMs: 1, venueExecutionId: 'v1' }];
      const badTargets = [{ accountId: 'ACC1', percentageBasis: 0.50, designatedCapacity: 'AGENCY' as const }];

      expect(() => engine.allocateBlockTrade('B1', fills, badTargets)).toThrow('must sum to 1.0');
    });
  });

  describe('ClearingReconciliationEngine', () => {
    it('accurately identifies breaks: missing trades, quantity discrepancies, and price mismatches', () => {
      const reconciler = new ClearingReconciliationEngine();

      const internalTrades = [
        { tradeId: 'T1', symbol: 'MSFT', side: 'BUY' as const, quantity: 500, price: 420.0, settlementDate: '20261010', counterparty: 'BARC' },
        { tradeId: 'T2', symbol: 'AAPL', side: 'SELL' as const, quantity: 1000, price: 230.0, settlementDate: '20261010', counterparty: 'JPM' },
        { tradeId: 'T3', symbol: 'GOOGL', side: 'BUY' as const, quantity: 200, price: 180.0, settlementDate: '20261010', counterparty: 'MS' },
      ];

      const clearingRecords = [
        { clearingTradeId: 'C1', symbol: 'MSFT', side: 'BUY' as const, quantity: 500, price: 420.0, settlementDate: '20261010', brokerOfRecord: 'BARC' }, // Exact match
        { clearingTradeId: 'C2', symbol: 'AAPL', side: 'SELL' as const, quantity: 950, price: 230.0, settlementDate: '20261010', brokerOfRecord: 'JPM' }, // Qty mismatch
        // T3 is missing in clearing
        { clearingTradeId: 'C4', symbol: 'AMZN', side: 'BUY' as const, quantity: 100, price: 190.0, settlementDate: '20261010', brokerOfRecord: 'GS' }, // Unmatched clearing record
      ];

      const breaks = reconciler.reconcileTrades(internalTrades, clearingRecords);
      expect(breaks.length).toBe(3);

      const qtyBreak = breaks.find(b => b.breakType === 'QUANTITY_MISMATCH');
      expect(qtyBreak).toBeDefined();
      expect(qtyBreak?.internalTradeId).toBe('T2');
      expect(qtyBreak?.clearingTradeId).toBe('C2');

      const missingInClr = breaks.find(b => b.breakType === 'MISSING_IN_CLEARING');
      expect(missingInClr).toBeDefined();
      expect(missingInClr?.internalTradeId).toBe('T3');

      const missingInInt = breaks.find(b => b.breakType === 'MISSING_IN_INTERNAL');
      expect(missingInInt).toBeDefined();
      expect(missingInInt?.clearingTradeId).toBe('C4');
    });
  });
});
