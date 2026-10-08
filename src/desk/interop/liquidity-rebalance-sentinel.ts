/**
 * Cross-Chain Liquidity Rebalance Sentinel
 * Identifies inventory depletion across bridge endpoints and generates automated rebalancing orders.
 *
 * @module desk/interop/liquidity-rebalance-sentinel
 */

import { ChainLiquidityBalance, RebalanceAction, SupportedChain } from './interop-types';

export class LiquidityRebalanceSentinel {
  private readonly balances = new Map<string, ChainLiquidityBalance>();

  public updateBalance(balance: ChainLiquidityBalance): void {
    const key = `${balance.chain}:${balance.asset}`;
    this.balances.set(key, balance);
  }

  public evaluateRebalanceNeeds(asset: string): RebalanceAction[] {
    const assetBalances = Array.from(this.balances.values()).filter((b) => b.asset === asset);
    if (assetBalances.length < 2) return [];

    const actions: RebalanceAction[] = [];
    const deficitChains = assetBalances.filter((b) => b.balance < b.minThreshold);
    const surplusChains = assetBalances.filter((b) => b.balance > b.targetBalance);

    for (const deficit of deficitChains) {
      const required = deficit.targetBalance - deficit.balance;
      // Find surplus donor chain with largest excess
      const sortedDonors = surplusChains
        .map((s) => ({ chain: s.chain, excess: s.balance - s.targetBalance }))
        .filter((d) => d.excess > 0n)
        .sort((a, b) => (a.excess < b.excess ? 1 : -1));

      const donor = sortedDonors[0];
      if (donor) {
        const transferAmount = donor.excess >= required ? required : donor.excess;
        const urgency = deficit.balance === 0n ? 'HIGH' : 'MEDIUM';

        actions.push({
          sourceChain: donor.chain,
          targetChain: deficit.chain,
          asset,
          rebalanceAmount: transferAmount,
          urgency,
        });
      }
    }

    return actions;
  }
}
