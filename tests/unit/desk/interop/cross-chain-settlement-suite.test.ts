import { describe, it, expect } from 'vitest';
import { AtomicBridgeRouter } from '../../../../src/desk/interop/atomic-bridge-router';
import { DynamicBridgeFeeEstimator } from '../../../../src/desk/interop/dynamic-bridge-fee-estimator';
import { LiquidityRebalanceSentinel } from '../../../../src/desk/interop/liquidity-rebalance-sentinel';

describe('Cross-Chain Settlement & Bridge Rebalancer Suite', () => {
  describe('AtomicBridgeRouter', () => {
    it('executes atomic cross-chain route dispatch and validates transfers', () => {
      const router = new AtomicBridgeRouter(['ethereum', 'arbitrum', 'base']);

      const failedSameChain = router.routeTransfer({
        transferId: 'tx-same',
        sourceChain: 'arbitrum',
        targetChain: 'arbitrum',
        asset: 'USDC',
        amount: 1000000n,
        maxSlippageBps: 10,
      });
      expect(failedSameChain.status).toBe('FAILED');

      const success = router.routeTransfer({
        transferId: 'tx-101',
        sourceChain: 'arbitrum',
        targetChain: 'base',
        asset: 'USDC',
        amount: 100000000n,
        maxSlippageBps: 20,
      });

      expect(success.status).toBe('SETTLED');
      expect(success.routeId).toBe('bridge-arbitrum-to-base');
      expect(success.settledAmount).toBe(99850000n); // 0.15% fee deducted
      expect(router.getTransferStatus('tx-101')?.status).toBe('SETTLED');
    });
  });

  describe('DynamicBridgeFeeEstimator', () => {
    it('models multi-dimensional gas and relayer fee components', () => {
      const estimator = new DynamicBridgeFeeEstimator(1.50);

      const l2Fee = estimator.estimateFee('arbitrum', 'base', 50_000);
      expect(l2Fee.destinationGasOverheadUsd).toBe(0.12);
      expect(l2Fee.variableRelayerFeeUsd).toBe(25); // 5 bps of 50k
      expect(l2Fee.estimatedFinalitySeconds).toBe(15);

      const ethFee = estimator.estimateFee('arbitrum', 'ethereum', 10_000);
      expect(ethFee.destinationGasOverheadUsd).toBe(15.0);
      expect(ethFee.baseL1FeeUsd).toBe(1.50);
      expect(ethFee.estimatedFinalitySeconds).toBe(60);
    });
  });

  describe('LiquidityRebalanceSentinel', () => {
    it('detects bridge reserve depletion and triggers donor-to-deficit rebalancing', () => {
      const sentinel = new LiquidityRebalanceSentinel();

      sentinel.updateBalance({
        chain: 'arbitrum',
        asset: 'USDC',
        balance: 5000000n,
        targetBalance: 3000000n,
        minThreshold: 1000000n,
      });

      sentinel.updateBalance({
        chain: 'base',
        asset: 'USDC',
        balance: 200000n,
        targetBalance: 2000000n,
        minThreshold: 500000n,
      });

      const rebalanceActions = sentinel.evaluateRebalanceNeeds('USDC');
      expect(rebalanceActions.length).toBe(1);
      expect(rebalanceActions[0]?.sourceChain).toBe('arbitrum');
      expect(rebalanceActions[0]?.targetChain).toBe('base');
      expect(rebalanceActions[0]?.rebalanceAmount).toBe(1800000n);
      expect(rebalanceActions[0]?.urgency).toBe('MEDIUM');
    });
  });
});
