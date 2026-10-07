/**
 * Private Mempool Bundle Relayer
 * Formulates and simulates private Flashbots-style bundles to protect transactions from public mempool sandwich attacks.
 *
 * @module desk/mev/private-mempool-bundle-relayer
 */

import { BundleRelayReceipt, PrivateBundleRequest } from './mev-protection-types';

export class PrivateMempoolBundleRelayer {
  private readonly minMinerTipGwei: number;
  private readonly maxTransactionsPerBundle: number;
  private readonly relayHistory = new Map<string, BundleRelayReceipt>();

  public constructor(minMinerTipGwei = 2.0, maxTransactionsPerBundle = 5) {
    this.minMinerTipGwei = minMinerTipGwei;
    this.maxTransactionsPerBundle = maxTransactionsPerBundle;
  }

  public simulateAndRelay(bundle: PrivateBundleRequest, currentBlockNumber: number): BundleRelayReceipt {
    if (bundle.transactions.length === 0) {
      return {
        bundleId: bundle.bundleId,
        isIncluded: false,
        blockNumber: currentBlockNumber,
        minerTipGwei: 0,
        rejectionReason: 'Bundle contains zero transactions',
      };
    }

    if (bundle.transactions.length > this.maxTransactionsPerBundle) {
      return {
        bundleId: bundle.bundleId,
        isIncluded: false,
        blockNumber: currentBlockNumber,
        minerTipGwei: 0,
        rejectionReason: `Exceeded max transaction limit (${this.maxTransactionsPerBundle})`,
      };
    }

    if (bundle.targetBlockNumber <= currentBlockNumber) {
      return {
        bundleId: bundle.bundleId,
        isIncluded: false,
        blockNumber: currentBlockNumber,
        minerTipGwei: 0,
        rejectionReason: 'Target block number already sealed or passed',
      };
    }

    const totalPriorityTip = bundle.transactions.reduce((acc, tx) => acc + tx.maxPriorityFeePerGasGwei, 0);
    const avgTip = totalPriorityTip / bundle.transactions.length;

    if (avgTip < this.minMinerTipGwei) {
      return {
        bundleId: bundle.bundleId,
        isIncluded: false,
        blockNumber: currentBlockNumber,
        minerTipGwei: avgTip,
        rejectionReason: `Miner tip below threshold (${this.minMinerTipGwei} Gwei)`,
      };
    }

    const receipt: BundleRelayReceipt = {
      bundleId: bundle.bundleId,
      isIncluded: true,
      blockNumber: bundle.targetBlockNumber,
      minerTipGwei: Number(avgTip.toFixed(2)),
    };

    this.relayHistory.set(bundle.bundleId, receipt);
    return receipt;
  }

  public getReceipt(bundleId: string): BundleRelayReceipt | undefined {
    return this.relayHistory.get(bundleId);
  }
}
