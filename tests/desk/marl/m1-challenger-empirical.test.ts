/**
 * Empirical Challenger Test Suite for Remediated Milestone 1 Models & Agents.
 * 
 * Adversarial stress testing for:
 * 1. BaseQuotingAgent Realized PnL Accounting Invariant (Delta-Cash conservation) under multi-fill cycles.
 * 2. AdaptiveQuotingAgent Numeric Robustness under NaN, Infinity, and extreme order book imbalance values.
 * 3. MultiAgentCoordinator Fill Routing & Inventory Isolation (Zero fill multiplication / duplicate inventory).
 */

import { describe, it, expect } from 'vitest';
import { AdaptiveQuotingAgent } from '../../../src/desk/marl/agents/adaptive-quoting-agent';
import { InventorySkewAgent } from '../../../src/desk/marl/agents/inventory-skew-agent';
import { MultiAgentCoordinator } from '../../../src/desk/marl/agents/multi-agent-coordinator';
import type { MarlAgentConfig, AgentObservation } from '../../../src/desk/marl/types/marl-types';
import type { MarlFillEvent } from '../../../src/desk/marl/types/marl-execution-types';

describe('Challenger Empirical Stress Suite: M1 Remediated Models & Agents', () => {
  const baseConfig: MarlAgentConfig = {
    agentId: 'challenger-agent-1',
    agentType: 'adaptive',
    gamma: 0.1,
    kappa: 1.5,
    maxInventory: 1000,
    quoteSize: 100,
    minSpread: 0.02,
    maxSpread: 0.20,
    tickSize: 0.01,
    enabled: true,
    weight: 1.0,
  };

  const sampleObs: AgentObservation = {
    symbol: 'ETH-2026-YES',
    venue: 'polymarket',
    midPrice: 0.50,
    bestBid: 0.49,
    bestAsk: 0.51,
    spread: 0.02,
    orderBookImbalance: 0.0,
    depthImbalance: 0.0,
    inventory: 0,
    timeToHorizonSec: 86400,
    volatility: 0.02,
    netDelta: 0,
    timestamp: 1700000000000,
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. BaseQuotingAgent Realized PnL Accounting & Multi-Fill Conservation
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('1. BaseQuotingAgent Realized PnL Accounting under Multi-Fill Cycles', () => {
    it('verifies exact Delta-Cash equality under canonical cycle: buy 10 @ 0.50, buy 10 @ 0.60, sell 10 @ 0.55, sell 10 @ 0.70 (zero fees)', () => {
      const agent = new AdaptiveQuotingAgent(baseConfig);

      expect(agent.getInventory()).toBe(0);
      expect(agent.getCostBasis()).toBe(0);
      expect(agent.getCashBalance()).toBe(0);
      expect(agent.getRealizedPnl()).toBe(0);

      // Step 1: Buy 10 @ 0.50
      // Cash: -5.00, Cost Basis: 0.50, Realized PnL: 0
      agent.onFill({
        fillId: 'f1',
        orderId: 'o1',
        agentId: baseConfig.agentId,
        symbol: baseConfig.symbol,
        venue: 'polymarket',
        side: 'buy',
        price: 0.50,
        amount: 10,
        fee: 0,
        liquidity: 'maker',
        timestamp: 1000,
      });

      expect(agent.getInventory()).toBe(10);
      expect(agent.getCostBasis()).toBeCloseTo(0.50, 6);
      expect(agent.getCashBalance()).toBeCloseTo(-5.00, 6);
      expect(agent.getRealizedPnl()).toBeCloseTo(0, 6);

      // Step 2: Buy 10 @ 0.60
      // Total units: 20, Total outlay: 11.00 -> Cost Basis: 0.55
      // Cash: -11.00, Realized PnL: 0
      agent.onFill({
        fillId: 'f2',
        orderId: 'o2',
        agentId: baseConfig.agentId,
        symbol: baseConfig.symbol,
        venue: 'polymarket',
        side: 'buy',
        price: 0.60,
        amount: 10,
        fee: 0,
        liquidity: 'maker',
        timestamp: 2000,
      });

      expect(agent.getInventory()).toBe(20);
      expect(agent.getCostBasis()).toBeCloseTo(0.55, 6);
      expect(agent.getCashBalance()).toBeCloseTo(-11.00, 6);
      expect(agent.getRealizedPnl()).toBeCloseTo(0, 6);

      // Step 3: Sell 10 @ 0.55
      // Inventory: 10, Sale proceeds: 5.50
      // Cash: -11.00 + 5.50 = -5.50
      // Realized delta: (10 * 0.55 - 0) - (0.55 * 10) = 0.00 -> Realized PnL: 0
      agent.onFill({
        fillId: 'f3',
        orderId: 'o3',
        agentId: baseConfig.agentId,
        symbol: baseConfig.symbol,
        venue: 'polymarket',
        side: 'sell',
        price: 0.55,
        amount: 10,
        fee: 0,
        liquidity: 'maker',
        timestamp: 3000,
      });

      expect(agent.getInventory()).toBe(10);
      expect(agent.getCostBasis()).toBeCloseTo(0.55, 6);
      expect(agent.getCashBalance()).toBeCloseTo(-5.50, 6);
      expect(agent.getRealizedPnl()).toBeCloseTo(0, 6);

      // Step 4: Sell 10 @ 0.70
      // Inventory: 0, Sale proceeds: 7.00
      // Cash: -5.50 + 7.00 = +1.50
      // Realized delta: (10 * 0.70 - 0) - (0.55 * 10) = 7.00 - 5.50 = +1.50 -> Realized PnL: +1.50
      agent.onFill({
        fillId: 'f4',
        orderId: 'o4',
        agentId: baseConfig.agentId,
        symbol: baseConfig.symbol,
        venue: 'polymarket',
        side: 'sell',
        price: 0.70,
        amount: 10,
        fee: 0,
        liquidity: 'maker',
        timestamp: 4000,
      });

      expect(agent.getInventory()).toBe(0);
      expect(agent.getCostBasis()).toBe(0);
      expect(agent.getCashBalance()).toBeCloseTo(1.50, 6);
      expect(agent.getRealizedPnl()).toBeCloseTo(1.50, 6);

      // Core invariant: Realized PnL == Net Cash Flow (Delta-Cash) when inventory returns to zero
      expect(agent.getRealizedPnl()).toEqual(agent.getCashBalance());
    });

    it('verifies exact Delta-Cash equality under canonical cycle WITH non-zero maker fees', () => {
      const agent = new AdaptiveQuotingAgent(baseConfig);
      const feePerTrade = 0.05;

      // Buy 10 @ 0.50 with fee 0.05 -> cash = -5.05, pnl = -0.05
      agent.onFill({
        fillId: 'f1', orderId: 'o1', agentId: baseConfig.agentId,
        symbol: baseConfig.symbol, venue: 'polymarket',
        side: 'buy', price: 0.50, amount: 10, fee: feePerTrade,
        liquidity: 'maker', timestamp: 1000,
      });

      // Buy 10 @ 0.60 with fee 0.05 -> cash = -5.05 - 6.05 = -11.10, pnl = -0.10
      agent.onFill({
        fillId: 'f2', orderId: 'o2', agentId: baseConfig.agentId,
        symbol: baseConfig.symbol, venue: 'polymarket',
        side: 'buy', price: 0.60, amount: 10, fee: feePerTrade,
        liquidity: 'maker', timestamp: 2000,
      });

      // Sell 10 @ 0.55 with fee 0.05 -> cash = -11.10 + 5.50 - 0.05 = -5.65
      // pnl delta = (5.50 - 0.05) - (0.55 * 10) = 5.45 - 5.50 = -0.05 -> pnl = -0.15
      agent.onFill({
        fillId: 'f3', orderId: 'o3', agentId: baseConfig.agentId,
        symbol: baseConfig.symbol, venue: 'polymarket',
        side: 'sell', price: 0.55, amount: 10, fee: feePerTrade,
        liquidity: 'maker', timestamp: 3000,
      });

      // Sell 10 @ 0.70 with fee 0.05 -> cash = -5.65 + 7.00 - 0.05 = +1.30
      // pnl delta = (7.00 - 0.05) - (0.55 * 10) = 6.95 - 5.50 = +1.45 -> pnl = -0.15 + 1.45 = +1.30
      agent.onFill({
        fillId: 'f4', orderId: 'o4', agentId: baseConfig.agentId,
        symbol: baseConfig.symbol, venue: 'polymarket',
        side: 'sell', price: 0.70, amount: 10, fee: feePerTrade,
        liquidity: 'maker', timestamp: 4000,
      });

      expect(agent.getInventory()).toBe(0);
      expect(agent.getCostBasis()).toBe(0);
      expect(agent.getCashBalance()).toBeCloseTo(1.30, 6);
      expect(agent.getRealizedPnl()).toBeCloseTo(1.30, 6);
      expect(agent.getRealizedPnl()).toBeCloseTo(agent.getCashBalance(), 6);
    });

    it('verifies Delta-Cash equality across 100 randomized multi-step buy/sell cycles', () => {
      const agent = new AdaptiveQuotingAgent(baseConfig);

      for (let cycle = 0; cycle < 100; cycle++) {
        agent.reset();
        let expectedCash = 0;
        let runningInventory = 0;

        // Perform 1 to 5 sequential buys
        const numBuys = 1 + Math.floor(Math.random() * 5);
        for (let b = 0; b < numBuys; b++) {
          const buyPrice = Number((0.20 + Math.random() * 0.60).toFixed(2));
          const buyAmount = 10 + Math.floor(Math.random() * 40);
          const buyFee = Number((buyAmount * 0.001).toFixed(4));
          expectedCash -= buyAmount * buyPrice + buyFee;
          runningInventory += buyAmount;

          agent.onFill({
            fillId: `b-${cycle}-${b}`,
            orderId: `ob-${cycle}-${b}`,
            agentId: baseConfig.agentId,
            symbol: baseConfig.symbol,
            venue: 'polymarket',
            side: 'buy',
            price: buyPrice,
            amount: buyAmount,
            fee: buyFee,
            liquidity: 'maker',
            timestamp: Date.now(),
          });
        }

        // Unwind in 1 to 3 sells to zero inventory
        while (runningInventory > 0) {
          const sellAmount = Math.min(runningInventory, 10 + Math.floor(Math.random() * 50));
          const sellPrice = Number((0.20 + Math.random() * 0.60).toFixed(2));
          const sellFee = Number((sellAmount * 0.001).toFixed(4));
          expectedCash += sellAmount * sellPrice - sellFee;
          runningInventory -= sellAmount;

          agent.onFill({
            fillId: `s-${cycle}-${runningInventory}`,
            orderId: `os-${cycle}-${runningInventory}`,
            agentId: baseConfig.agentId,
            symbol: baseConfig.symbol,
            venue: 'polymarket',
            side: 'sell',
            price: sellPrice,
            amount: sellAmount,
            fee: sellFee,
            liquidity: 'maker',
            timestamp: Date.now(),
          });
        }

        expect(agent.getInventory()).toBe(0);
        expect(agent.getCostBasis()).toBe(0);
        expect(agent.getCashBalance()).toBeCloseTo(expectedCash, 4);
        expect(agent.getRealizedPnl()).toBeCloseTo(expectedCash, 4);
        expect(agent.getRealizedPnl()).toBeCloseTo(agent.getCashBalance(), 4);
      }
    });

    it('ignores fills addressed to foreign agent IDs without mutating state', () => {
      const agent = new AdaptiveQuotingAgent(baseConfig);
      agent.onFill({
        fillId: 'f-foreign',
        orderId: 'o-foreign',
        agentId: 'foreign-agent-999',
        symbol: baseConfig.symbol,
        venue: 'polymarket',
        side: 'buy',
        price: 0.50,
        amount: 50,
        fee: 0.01,
        liquidity: 'maker',
        timestamp: 1000,
      });

      expect(agent.getInventory()).toBe(0);
      expect(agent.getCashBalance()).toBe(0);
      expect(agent.getRealizedPnl()).toBe(0);
      expect(agent.getCostBasis()).toBe(0);
      expect(agent.getStats().fillsCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. AdaptiveQuotingAgent Numeric Robustness (NaN / Infinity / Extremes)
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('2. AdaptiveQuotingAgent Numeric Robustness under NaN, Infinity, and Extremes', () => {
    it('guarantees quotes NEVER contain NaN under pathological orderBookImbalance inputs', () => {
      const agent = new AdaptiveQuotingAgent(baseConfig);

      const pathologicalImbalances = [
        NaN,
        Infinity,
        -Infinity,
        1e12,
        -1e12,
        1e-15,
        -1e-15,
        Number.MAX_VALUE,
        -Number.MAX_VALUE,
        Number.MIN_VALUE,
        Number.EPSILON,
        -0,
        +0,
        undefined as unknown as number,
        null as unknown as number,
      ];

      for (const badImbalance of pathologicalImbalances) {
        const obs: AgentObservation = {
          ...sampleObs,
          orderBookImbalance: badImbalance,
        };

        const quote = agent.computeQuote(obs);

        // Verification of numeric integrity
        expect(Number.isNaN(quote.bidPrice)).toBe(false);
        expect(Number.isNaN(quote.askPrice)).toBe(false);
        expect(Number.isNaN(quote.bidSpread)).toBe(false);
        expect(Number.isNaN(quote.askSpread)).toBe(false);
        expect(Number.isNaN(quote.reservationPrice)).toBe(false);
        expect(Number.isNaN(quote.confidence)).toBe(false);
        expect(Number.isNaN(quote.skewFactor)).toBe(false);
        expect(Number.isNaN(quote.metadata?.imbalance)).toBe(false);
        expect(Number.isNaN(quote.metadata?.invRatio)).toBe(false);

        // Verification of finite values
        expect(Number.isFinite(quote.bidPrice)).toBe(true);
        expect(Number.isFinite(quote.askPrice)).toBe(true);
        expect(Number.isFinite(quote.bidSpread)).toBe(true);
        expect(Number.isFinite(quote.askSpread)).toBe(true);
        expect(Number.isFinite(quote.confidence)).toBe(true);
        expect(Number.isFinite(quote.skewFactor)).toBe(true);

        // Verification of market bounds [0.01, 0.99] and non-crossing
        expect(quote.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(quote.askPrice).toBeLessThanOrEqual(0.99);
        expect(quote.askPrice).toBeGreaterThan(quote.bidPrice);
      }
    });

    it('guarantees quotes NEVER contain NaN across extreme multi-dimensional boundary inputs', () => {
      const agent = new AdaptiveQuotingAgent(baseConfig);

      const testGrid = [
        { midPrice: 0.01, volatility: 0.001, tau: 10, imbalance: NaN },
        { midPrice: 0.99, volatility: 0.99, tau: 86400, imbalance: Infinity },
        { midPrice: 0.50, volatility: 0, tau: 0, imbalance: -Infinity },
        { midPrice: 0.50, volatility: 5.0, tau: -100, imbalance: 1e9 },
        { midPrice: 0.02, volatility: 0.1, tau: 1, imbalance: -1e9 },
        { midPrice: 0.98, volatility: 0.2, tau: 100000, imbalance: NaN },
      ];

      for (const t of testGrid) {
        const obs: AgentObservation = {
          ...sampleObs,
          midPrice: t.midPrice,
          volatility: t.volatility,
          timeToHorizonSec: t.tau,
          orderBookImbalance: t.imbalance,
        };

        const quote = agent.computeQuote(obs);

        expect(Number.isNaN(quote.bidPrice)).toBe(false);
        expect(Number.isNaN(quote.askPrice)).toBe(false);
        expect(quote.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(quote.askPrice).toBeLessThanOrEqual(0.99);
        expect(quote.askPrice).toBeGreaterThan(quote.bidPrice);
        expect(quote.bidSize).toBeGreaterThan(0);
        expect(quote.askSize).toBeGreaterThan(0);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. MultiAgentCoordinator Fill Routing & Inventory Isolation
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('3. MultiAgentCoordinator Fill Routing & Inventory Isolation', () => {
    it('routes best_quote buy fills ONLY to winning bid agent and does not multiply inventory across all agents', () => {
      const agentA = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'agent-A', weight: 1.0 });
      const agentB = new InventorySkewAgent({ ...baseConfig, agentId: 'agent-B', weight: 1.0 });
      const agentC = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'agent-C', weight: 1.0 });

      const coordinator = new MultiAgentCoordinator([agentA, agentB, agentC]);

      // Give agentB a high positive inventory so its bids drop and asks become competitive
      agentB.setInventory(500);

      // Coordinate to determine winning agents
      const proposal = coordinator.coordinate(sampleObs, 'best_quote');
      expect(proposal).not.toBeNull();
      expect(proposal?.agentId).toBe('coordinator:best_quote');

      const winningBidAgentId = coordinator.getLastBestBidAgentId();
      const winningAskAgentId = coordinator.getLastBestAskAgentId();
      expect(winningBidAgentId).toBeTruthy();
      expect(winningAskAgentId).toBeTruthy();

      const initialTotalPortfolioInventory =
        agentA.getInventory() + agentB.getInventory() + agentC.getInventory();

      const fillAmount = 50;
      const fillFee = 0.05;

      // Dispatch a BUY fill originating from the coordinated proposal
      const buyFill: MarlFillEvent = {
        fillId: 'fill-buy-1',
        orderId: 'order-buy-1',
        agentId: 'coordinator:best_quote',
        symbol: sampleObs.symbol,
        venue: sampleObs.venue,
        side: 'buy',
        price: proposal!.bidPrice,
        amount: fillAmount,
        fee: fillFee,
        liquidity: 'maker',
        timestamp: Date.now(),
      };

      coordinator.dispatchFill(buyFill);

      // Verify ONLY the winning bid agent received the fill
      const winningBidAgent = coordinator.getAgent(winningBidAgentId!);
      expect(winningBidAgent?.getStats().fillsCount).toBe(1);

      // Check non-winning agents
      const otherAgents = [agentA, agentB, agentC].filter((a) => a.config.agentId !== winningBidAgentId);
      for (const nonWinner of otherAgents) {
        expect(nonWinner.getStats().fillsCount).toBe(0);
      }

      // Check strict inventory conservation: portfolio inventory increased by EXACTLY fillAmount (NOT 3x!)
      const newTotalPortfolioInventory =
        agentA.getInventory() + agentB.getInventory() + agentC.getInventory();
      expect(newTotalPortfolioInventory).toBe(initialTotalPortfolioInventory + fillAmount);
    });

    it('routes best_quote sell fills ONLY to winning ask agent without multiplying inventory', () => {
      const agentA = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'agent-A', weight: 1.0 });
      const agentB = new InventorySkewAgent({ ...baseConfig, agentId: 'agent-B', weight: 1.0 });
      const agentC = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'agent-C', weight: 1.0 });

      // Pre-seed inventories
      agentA.setInventory(100);
      agentB.setInventory(100);
      agentC.setInventory(100);

      const coordinator = new MultiAgentCoordinator([agentA, agentB, agentC]);
      const proposal = coordinator.coordinate(sampleObs, 'best_quote');
      expect(proposal).not.toBeNull();

      const winningAskAgentId = coordinator.getLastBestAskAgentId();
      expect(winningAskAgentId).toBeTruthy();

      const initialTotalPortfolioInventory =
        agentA.getInventory() + agentB.getInventory() + agentC.getInventory();
      expect(initialTotalPortfolioInventory).toBe(300);

      const sellAmount = 40;
      const sellFill: MarlFillEvent = {
        fillId: 'fill-sell-1',
        orderId: 'order-sell-1',
        agentId: 'coordinator:best_quote',
        symbol: sampleObs.symbol,
        venue: sampleObs.venue,
        side: 'sell',
        price: proposal!.askPrice,
        amount: sellAmount,
        fee: 0.04,
        liquidity: 'maker',
        timestamp: Date.now(),
      };

      coordinator.dispatchFill(sellFill);

      // Verify ONLY the winning ask agent processed the fill
      const winningAskAgent = coordinator.getAgent(winningAskAgentId!);
      expect(winningAskAgent?.getInventory()).toBe(100 - sellAmount);
      expect(winningAskAgent?.getStats().fillsCount).toBe(1);

      // Other agents remain completely untouched
      const otherAgents = [agentA, agentB, agentC].filter((a) => a.config.agentId !== winningAskAgentId);
      for (const nonWinner of otherAgents) {
        expect(nonWinner.getInventory()).toBe(100);
        expect(nonWinner.getStats().fillsCount).toBe(0);
      }

      // Strict conservation: portfolio decreased by EXACTLY sellAmount (300 - 40 = 260)
      const afterTotalInventory =
        agentA.getInventory() + agentB.getInventory() + agentC.getInventory();
      expect(afterTotalInventory).toBe(260);
    });

    it('isolates fills across multiple symbols correctly without cross-symbol leakage', () => {
      const agentA = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'agent-sym1', weight: 1.0 });
      const agentB = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'agent-sym2', weight: 1.0 });
      const coordinator = new MultiAgentCoordinator([agentA, agentB]);

      const obs1: AgentObservation = { ...sampleObs, symbol: 'POL-YES' };
      const obs2: AgentObservation = { ...sampleObs, symbol: 'POL-NO' };

      // Coordinate for both symbols
      coordinator.coordinate(obs1, 'best_quote');
      coordinator.coordinate(obs2, 'best_quote');

      // Dispatch fill for POL-YES
      coordinator.dispatchFill({
        fillId: 'f-yes',
        orderId: 'o-yes',
        agentId: 'coordinator:best_quote',
        symbol: 'POL-YES',
        venue: 'polymarket',
        side: 'buy',
        price: 0.50,
        amount: 25,
        fee: 0.01,
        liquidity: 'maker',
        timestamp: Date.now(),
      });

      // Total fills across coordinator must be exactly 1
      const allFillsCount = agentA.getStats().fillsCount + agentB.getStats().fillsCount;
      expect(allFillsCount).toBe(1);

      const totalInventory = agentA.getInventory() + agentB.getInventory();
      expect(totalInventory).toBe(25);
    });

    it('safely partitions uncoordinated/ambiguous fills without inventory creation or destruction', () => {
      const agent1 = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'ag-1', weight: 1.0 });
      const agent2 = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'ag-2', weight: 2.0 });
      const agent3 = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'ag-3', weight: 1.0 });
      const coordinator = new MultiAgentCoordinator([agent1, agent2, agent3]);

      // Ambiguous fill with unknown agentId and unknown symbol (fallback to proportional dispatch)
      const totalAmount = 100;
      const totalFee = 0.40;
      coordinator.dispatchFill({
        fillId: 'f-fallback',
        orderId: 'o-fallback',
        agentId: 'external-taker-fill',
        symbol: 'UNKNOWN-SYMBOL',
        venue: 'polymarket',
        side: 'buy',
        price: 0.50,
        amount: totalAmount,
        fee: totalFee,
        liquidity: 'maker',
        timestamp: Date.now(),
      });

      const inv1 = agent1.getInventory();
      const inv2 = agent2.getInventory();
      const inv3 = agent3.getInventory();

      // Proportions: 1/4 (25), 2/4 (50), 1/4 (25)
      expect(inv1).toBe(25);
      expect(inv2).toBe(50);
      expect(inv3).toBe(25);

      // Sum strictly equals 100
      expect(inv1 + inv2 + inv3).toBe(totalAmount);
    });
  });
});
