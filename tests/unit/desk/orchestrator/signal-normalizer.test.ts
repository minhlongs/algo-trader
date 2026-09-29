import { describe, it, expect } from 'vitest';
import { SignalNormalizer, mapVenue } from '../../../../src/desk/orchestrator/signal-normalizer';
import type { ArbitrageOpportunity as EngineArbOpp } from '../../../../src/desk/arbitrage/engine/arbitrage-engine-types';
import type { ArbitrageOpportunity as SpreadArbOpp } from '../../../../src/desk/arbitrage/spread-detector-types';
import type { QuoteProposal } from '../../../../src/desk/marl/types/marl-types';
import type { MarlLimitOrder } from '../../../../src/desk/marl/types/marl-execution-types';
import type { TwoSidedQuote, RebalanceOrder } from '../../../../src/desk/amm/types/liquidity-types';
import type { ArbitrageOpportunity as AmmArbOpp } from '../../../../src/desk/amm/types/arbitrage-types';
import type { AISignal } from '../../../../src/desk/strategies/ai-signal-adapter-types';
import type { TradeSignal } from '../../../../src/desk/execution/paper-position-types';

describe('SignalNormalizer & Venue Mapping', () => {
  const normalizer = new SignalNormalizer();

  describe('mapVenue', () => {
    it('maps all venue patterns correctly including fallbacks', () => {
      expect(mapVenue(undefined)).toBe('binance');
      expect(mapVenue('')).toBe('binance');
      expect(mapVenue('binance_futures')).toBe('binance');
      expect(mapVenue('BYBIT_PERP')).toBe('bybit');
      expect(mapVenue('polymarket_orderbook')).toBe('polymarket_clob');
      expect(mapVenue('CLOB_ORDERBOOK')).toBe('polymarket_clob');
      expect(mapVenue('lmsr_pool')).toBe('amm_lmsr');
      expect(mapVenue('cpmm_pool')).toBe('amm_cpmm');
      expect(mapVenue('uniswap_amm')).toBe('amm_cpmm');
      expect(mapVenue('unknown_venue')).toBe('binance');
    });
  });

  describe('normalizeArbitrage', () => {
    it('normalizes multi-leg engine arbitrage opportunity with legs', () => {
      const opp: EngineArbOpp = {
        id: 'engine-arb-1',
        type: 'multi-leg',
        symbol: 'ETH/USDT',
        netProfitBps: 45,
        estimatedProfitUsd: 150,
        confidence: 0.95,
        timestamp: Date.now(),
        legs: [
          {
            symbol: 'ETH/USDT',
            venue: 'binance',
            side: 'BUY',
            amount: 2.5,
            price: 3000,
          },
          {
            symbol: 'ETH/USDT',
            exchange: 'bybit',
            side: 'sell',
            amount: 2.5,
            price: 3015,
          },
        ],
      };

      const intents = normalizer.normalizeArbitrage(opp);
      expect(intents).toHaveLength(2);
      expect(intents[0].engineId).toBe('arbitrage');
      expect(intents[0].symbol).toBe('ETH/USDT');
      expect(intents[0].venue).toBe('binance');
      expect(intents[0].side).toBe('BUY');
      expect(intents[0].quantity).toBe(2.5);
      expect(intents[0].price).toBe(3000);
      expect(intents[0].expectedEdgeBps).toBe(45);
      expect(intents[0].orderType).toBe('IOC');

      expect(intents[1].side).toBe('SELL');
      expect(intents[1].venue).toBe('bybit');
    });

    it('uses default netProfitBps when not provided in legs arbitrage', () => {
      const opp = {
        id: 'leg-arb-no-edge',
        legs: [
          { symbol: 'BTC/USDT', side: 'BUY', amount: 0.1, price: 50000 },
        ],
      } as unknown as EngineArbOpp;

      const intents = normalizer.normalizeArbitrage(opp);
      expect(intents[0].expectedEdgeBps).toBe(30);
    });

    it('normalizes spread arbitrage opportunity with fallbacks', () => {
      const sOpp: SpreadArbOpp = {
        id: 'spread-1',
        symbol: 'SOL/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 150,
        sellPrice: 152,
        spreadPercent: 0.0133,
        spreadUsd: 2,
        timestamp: Date.now(),
      };

      const intents = normalizer.normalizeArbitrage(sOpp, 5.0);
      expect(intents).toHaveLength(2);
      expect(intents[0].side).toBe('BUY');
      expect(intents[0].venue).toBe('binance');
      expect(intents[0].quantity).toBe(5.0);
      expect(intents[0].expectedEdgeBps).toBe(133);
      expect(intents[1].side).toBe('SELL');
      expect(intents[1].venue).toBe('bybit');
      expect(intents[1].price).toBe(152);
    });

    it('handles minimal spread arb with fallback symbol, spreadPercent, tradeSize', () => {
      const minimalOpp = {
        id: 'min-1',
      } as unknown as EngineArbOpp;

      const intents = normalizer.normalizeArbitrage(minimalOpp);
      expect(intents).toHaveLength(2);
      expect(intents[0].symbol).toBe('BTC/USDT');
      expect(intents[0].expectedEdgeBps).toBe(50);
      expect(intents[0].quantity).toBe(1.0);
    });

    it('handles EngineArbOpp without legs using amount and buyVenue/sellVenue', () => {
      const eOpp = {
        id: 'engine-spread-1',
        symbol: 'AVAX/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 30,
        sellPrice: 31,
        tradeSize: 10,
        netProfitBps: 60,
      } as unknown as EngineArbOpp;

      const intents = normalizer.normalizeArbitrage(eOpp);
      expect(intents).toHaveLength(2);
      expect(intents[0].symbol).toBe('AVAX/USDT');
      expect(intents[0].quantity).toBe(10);
      expect(intents[0].expectedEdgeBps).toBe(60);
    });
  });

  describe('normalizeMarlQuote', () => {
    it('normalizes MARL quote proposal with reservation price and timestamp', () => {
      const proposal: QuoteProposal = {
        agentId: 'marl-agent-1',
        symbol: 'BTC/USDT',
        venue: 'binance',
        bidPrice: 50000,
        askPrice: 50020,
        bidSize: 0.5,
        askSize: 0.5,
        confidence: 0.8,
        reservationPrice: 50010,
        timestamp: 1700000000000,
      };

      const intents = normalizer.normalizeMarlQuote(proposal);
      expect(intents).toHaveLength(2);
      expect(intents[0].side).toBe('BUY');
      expect(intents[0].price).toBe(50000);
      expect(intents[0].quantity).toBe(0.5);
      expect(intents[0].orderType).toBe('LIMIT');
      expect(intents[0].urgency).toBe('LOW');
      expect(intents[0].expectedSharpe).toBe(1.6);
      expect(intents[1].side).toBe('SELL');
      expect(intents[1].price).toBe(50020);
    });

    it('handles MARL quote without reservationPrice or timestamp', () => {
      const proposal: QuoteProposal = {
        agentId: 'marl-agent-2',
        symbol: 'ETH/USDT',
        venue: 'bybit',
        bidPrice: 3000,
        askPrice: 3001,
        bidSize: 1.0,
        askSize: 1.0,
        confidence: 0.2,
      };

      const intents = normalizer.normalizeMarlQuote(proposal);
      expect(intents).toHaveLength(2);
      expect(intents[0].expectedEdgeBps).toBeGreaterThanOrEqual(5);
      expect(intents[0].expectedSharpe).toBe(1.0);
    });
  });

  describe('normalizeMarlOrder', () => {
    it('normalizes limit order without hedge', () => {
      const order: MarlLimitOrder = {
        orderId: 'ord-101',
        agentId: 'agent-1',
        symbol: 'BTC/USDT',
        venue: 'binance',
        side: 'buy',
        type: 'limit',
        amount: 0.5,
        price: 50000,
        remainingAmount: 0.3,
        status: 'open',
        timestamp: Date.now(),
      };

      const intent = normalizer.normalizeMarlOrder(order, false);
      expect(intent.intentId).toBe('marl-ord-101');
      expect(intent.orderType).toBe('LIMIT');
      expect(intent.side).toBe('BUY');
      expect(intent.quantity).toBe(0.3);
      expect(intent.price).toBe(50000);
      expect(intent.urgency).toBe('MEDIUM');
      expect(intent.isRiskReducing).toBe(false);
      expect(intent.timeToExpiryMs).toBe(5000);
    });

    it('normalizes market order with hedge and zero remaining amount', () => {
      const order: MarlLimitOrder = {
        orderId: 'ord-102',
        agentId: 'agent-2',
        symbol: 'ETH/USDT',
        venue: 'bybit',
        side: 'sell',
        type: 'market',
        amount: 2.0,
        price: 3000,
        remainingAmount: 0,
        status: 'open',
        timestamp: Date.now(),
      };

      const intent = normalizer.normalizeMarlOrder(order, true);
      expect(intent.orderType).toBe('MARKET');
      expect(intent.side).toBe('SELL');
      expect(intent.quantity).toBe(2.0);
      expect(intent.price).toBeUndefined();
      expect(intent.urgency).toBe('HIGH');
      expect(intent.isRiskReducing).toBe(true);
      expect(intent.timeToExpiryMs).toBe(500);
    });

    it('normalizes ioc order correctly', () => {
      const order: MarlLimitOrder = {
        orderId: 'ord-103',
        agentId: 'agent-3',
        symbol: 'SOL/USDT',
        venue: 'binance',
        side: 'buy',
        type: 'ioc',
        amount: 10,
        price: 150,
        remainingAmount: 10,
        status: 'open',
        timestamp: Date.now(),
      };

      const intent = normalizer.normalizeMarlOrder(order, false);
      expect(intent.orderType).toBe('IOC');
      expect(intent.isRiskReducing).toBe(true);
      expect(intent.urgency).toBe('HIGH');
    });
  });

  describe('normalizeAmmQuote & normalizeAmmRebalance', () => {
    it('normalizes two-sided AMM quote', () => {
      const quote: TwoSidedQuote = {
        outcomeId: 'out-1',
        bidPrice: 0.45,
        askPrice: 0.55,
        bidSize: 100,
        askSize: 100,
        spreadBps: 200,
        timestamp: 1700000000000,
      };

      const intents = normalizer.normalizeAmmQuote(quote, 'POL/USDT', 'amm_cpmm');
      expect(intents).toHaveLength(2);
      expect(intents[0].side).toBe('BUY');
      expect(intents[0].orderType).toBe('TWO_SIDED_QUOTE');
      expect(intents[0].expectedEdgeBps).toBe(200);
      expect(intents[1].side).toBe('SELL');
    });

    it('normalizes AMM rebalance order with different urgencies', () => {
      const rHigh: RebalanceOrder = {
        rebalanceId: 'reb-1',
        outcomeId: 'out-high',
        venue: 'polymarket',
        side: 'BUY',
        targetQuantity: 500,
        limitPrice: 0.60,
        urgency: 'HIGH',
        reason: 'Imbalance > 15%',
      };
      const intentHigh = normalizer.normalizeAmmRebalance(rHigh);
      expect(intentHigh.timeToExpiryMs).toBe(1000);
      expect(intentHigh.isRiskReducing).toBe(true);
      expect(intentHigh.metadata?.reason).toBe('Imbalance > 15%');

      const rMed: RebalanceOrder = {
        ...rHigh,
        rebalanceId: 'reb-2',
        urgency: 'MEDIUM',
      };
      expect(normalizer.normalizeAmmRebalance(rMed).timeToExpiryMs).toBe(5000);

      const rLow: RebalanceOrder = {
        ...rHigh,
        rebalanceId: 'reb-3',
        urgency: 'LOW',
      };
      expect(normalizer.normalizeAmmRebalance(rLow).timeToExpiryMs).toBe(15000);
    });
  });

  describe('normalizeAmmArbitrage', () => {
    it('normalizes AMM arbitrage opportunity across CLOB and CPMM venues', () => {
      const opp: AmmArbOpp = {
        id: 'amm-arb-99',
        type: 'binary-complement',
        conditionId: 'cond-123',
        netEdge: 0.025,
        estimatedProfit: 250,
        legs: [
          {
            outcomeIndex: 0,
            outcomeSymbol: 'YES',
            venue: 'CLOB',
            action: 'BUY',
            price: 0.48,
            size: 500,
          },
          {
            outcomeIndex: 1,
            outcomeSymbol: 'NO',
            venue: 'CPMM',
            action: 'SELL',
            price: 0.54,
            size: 500,
          },
        ],
        timestamp: Date.now(),
      };

      const intents = normalizer.normalizeAmmArbitrage(opp);
      expect(intents).toHaveLength(2);
      expect(intents[0].venue).toBe('polymarket_clob');
      expect(intents[0].orderType).toBe('MULTI_LEG_BUNDLE');
      expect(intents[0].expectedEdgeBps).toBe(250);
      expect(intents[1].venue).toBe('amm_cpmm');
    });
  });

  describe('normalizeAlphaSignal & normalizeTradeSignal', () => {
    it('normalizes high-confidence AISignal with calibrated confidence', () => {
      const signal: AISignal = {
        signalId: 'sig-alpha-1',
        strategyId: 'strat-momentum',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        confidence: 0.90,
        calibratedConfidence: 0.88,
        expectancy: 0.04,
        regime: 'TREND_UP',
        expectedHoldingPeriod: 12,
        timestamp: Date.now(),
      };

      const intent = normalizer.normalizeAlphaSignal(signal, 0.5, 'binance');
      expect(intent.intentId).toBe('alpha-sig-alpha-1');
      expect(intent.engineId).toBe('alpha-lab');
      expect(intent.side).toBe('BUY');
      expect(intent.quantity).toBe(0.5);
      expect(intent.urgency).toBe('MEDIUM');
      expect(intent.expectedEdgeBps).toBe(400);
      expect(intent.expectedSharpe).toBeCloseTo(0.88 * 2.5);
      expect(intent.timeToExpiryMs).toBe(12 * 3600 * 1000);
    });

    it('normalizes low-confidence AISignal with fallback action and holding period', () => {
      const signal = {
        strategyId: 'strat-low',
        action: 'SELL',
        confidence: 0.65,
        expectancy: 0.005,
      } as unknown as AISignal;

      const intent = normalizer.normalizeAlphaSignal(signal);
      expect(intent.intentId).toContain('alpha-strat-low');
      expect(intent.symbol).toBe('BTC/USDT');
      expect(intent.side).toBe('SELL');
      expect(intent.urgency).toBe('LOW');
      expect(intent.expectedEdgeBps).toBe(50);
      expect(intent.timeToExpiryMs).toBe(24 * 3600 * 1000);
    });

    it('normalizes TradeSignal with limit and market price scenarios', () => {
      const limitSignal: TradeSignal = {
        symbol: 'ETH/USDT',
        side: 'buy',
        quantity: 2.0,
        price: 3000,
      };
      const limitIntent = normalizer.normalizeTradeSignal(limitSignal);
      expect(limitIntent.side).toBe('BUY');
      expect(limitIntent.quantity).toBe(2.0);
      expect(limitIntent.price).toBe(3000);
      expect(limitIntent.orderType).toBe('LIMIT');

      const marketSignal: TradeSignal = {
        symbol: 'SOL/USDT',
        side: 'sell',
        quantity: 15,
      };
      const marketIntent = normalizer.normalizeTradeSignal(marketSignal, 'bybit');
      expect(marketIntent.venue).toBe('bybit');
      expect(marketIntent.side).toBe('SELL');
      expect(marketIntent.price).toBeUndefined();
      expect(marketIntent.orderType).toBe('MARKET');
    });
  });
});
