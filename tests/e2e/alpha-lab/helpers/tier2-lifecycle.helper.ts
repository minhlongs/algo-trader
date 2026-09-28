import { describe, it, expect } from 'vitest';
import { transition } from '../../../../src/alpha-lab/attribution/promotion-state-machine';
import { evaluateNumericGate } from '../../../../src/alpha-lab/gates/gate-evaluator';
import { LiveExecutionGuard } from '../../../../src/desk/execution/live-execution-guard-core';
import type { PolymarketOrder } from '../../../../src/desk/execution/polymarket-signer';

export function registerTier2LifecycleTests(): void {
  describe('Feature 9: Canonical 6-State Lifecycle State Machine Boundaries (F9)', () => {
    it('B9.1: blocks direct promotion from CANDIDATE to LIVE_APPROVED', () => {
      expect(transition('CANDIDATE', 'promote', {})).toBe('CANDIDATE');
    });

    it('B9.2: blocks direct promotion from PAPER_APPROVED to LIVE_APPROVED via invalid trigger', () => {
      expect(transition('PAPER_APPROVED', 'evaluate', {})).toBe('PAPER_APPROVED');
    });

    it('B9.3: rejects from BASELINE_GATE to REJECTED via survival trigger with bad evidence', () => {
      expect(transition('BASELINE_GATE', 'survival', {})).toBe('BASELINE_GATE');
    });

    it('B9.4: terminal state REJECTED rejects all incoming triggers', () => {
      const triggers = ['evaluate', 'baseline', 'walkforward', 'survival', 'promote', 'reject'] as const;
      for (const trig of triggers) {
        expect(transition('REJECTED', trig, {})).toBe('REJECTED');
      }
    });

    it('B9.5: survival gate evidence with exact threshold values passes', () => {
      const next = transition('WALK_FORWARD', 'survival', {
        winRate: 0.50, sharpe: 0.0, totalNetPnl: 100, randomPnl: 50, consistencyScore: 0.5, testTrades: 10, overfitGap: 0.15,
      });
      expect(next).toBe('SURVIVAL_GATE');
    });
  });

  describe('Feature 10: Live Promotion Protocol Boundaries (F10)', () => {
    it('B10.1: boundary duration: 30 days passes, 29.9 days fails', () => {
      expect(evaluateNumericGate('duration', 30.0).passed).toBe(true);
      expect(evaluateNumericGate('duration', 29.9).passed).toBe(false);
    });

    it('B10.2: boundary trade count: 50 trades passes, 49 trades fails', () => {
      expect(evaluateNumericGate('trade_count', 50).passed).toBe(true);
      expect(evaluateNumericGate('trade_count', 49).passed).toBe(false);
    });

    it('B10.3: boundary win rate: 55.0% passes, 54.9% fails', () => {
      expect(evaluateNumericGate('win_rate', 0.55).passed).toBe(true);
      expect(evaluateNumericGate('win_rate', 0.549).passed).toBe(false);
    });

    it('B10.4: boundary max drawdown: 15.0% passes, 15.1% fails', () => {
      expect(evaluateNumericGate('max_drawdown', 0.15).passed).toBe(true);
      expect(evaluateNumericGate('max_drawdown', 0.151).passed).toBe(false);
    });

    it('B10.5: throws on evaluating non-numeric gate with evaluateNumericGate', () => {
      expect(() => evaluateNumericGate('circuit_breaker', 1)).toThrow('not a numeric gate');
    });
  });

  describe('Feature 11: Circuit Breaker Quarantine & Signal Blocking Boundaries (F11)', () => {
    const validOrder: PolymarketOrder = {
      tokenId: '0x123', side: 'BUY', price: 1.0, size: 2000, expiration: 0, nonce: '1', feeRateBps: 0, signatureType: 0,
    };

    it('B11.1: order size exactly at 2% boundary ($2,000 on $100k capital) is approved', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      const res = guard.guardOrder(validOrder);
      expect(res.approved).toBe(true);
      expect(res.checks.positionSizeOk).toBe(true);
    });

    it('B11.2: order size $2,000.01 on $100k capital is rejected', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      const res = guard.guardOrder({ ...validOrder, size: 2000.01 });
      expect(res.approved).toBe(false);
      expect(res.checks.positionSizeOk).toBe(false);
    });

    it('B11.3: daily drawdown loss of $4,999 on $100k capital passes; $5,000 fails', () => {
      const guardPass = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      guardPass.recordLoss(-4999);
      expect(guardPass.guardOrder(validOrder).approved).toBe(true);

      const guardFail = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      guardFail.recordLoss(-5000);
      expect(guardFail.guardOrder(validOrder).approved).toBe(false);
    });

    it('B11.4: guard in disabled mode (PAPER mode) approves orders exceeding size and drawdown', () => {
      const guardDisabled = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: false });
      guardDisabled.recordLoss(-50000);
      expect(guardDisabled.guardOrder({ ...validOrder, size: 50000 }).approved).toBe(true);
    });

    it('B11.5: resetDaily clears accumulated loss and restores approval', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      guard.recordLoss(-8000);
      expect(guard.guardOrder(validOrder).approved).toBe(false);
      guard.resetDaily();
      expect(guard.guardOrder(validOrder).approved).toBe(true);
    });
  });
}
