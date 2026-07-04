/**
 * Tests for DecisionAidsPanel
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DecisionAidsPanel } from '../DecisionAidsPanel';
import { useRiskPreferencesStore } from '../../../stores/risk-preferences-store';
import { useTradingStore } from '../../../stores/trading-store';
import type { TradeRecord } from '../../../stores/trading-store';

const resetRiskStore = () => {
  useRiskPreferencesStore.getState().resetPreferences();
};

const clearTradingStore = () => {
  useTradingStore.getState().setTrades([]);
};

describe('DecisionAidsPanel', () => {
  beforeEach(() => {
    resetRiskStore();
    clearTradingStore();
  });

  it('renders both calculator and confidence components', () => {
    render(<DecisionAidsPanel />);
    expect(screen.getByText('What-If Calculator')).toBeDefined();
    expect(screen.getByText('System Confidence')).toBeDefined();
  });

  it('displays neutral confidence when no trade history', () => {
    render(<DecisionAidsPanel />);
    expect(screen.getByText('Signal Accuracy')).toBeDefined();
    // The win rate should show N/A when no trades
    const winRateLabel = screen.getByText('Win Rate');
    const winRateValue = winRateLabel.parentElement?.querySelector('.font-mono');
    expect(winRateValue?.textContent).toBe('N/A');
    // Total trades should show 0
    const totalLabel = screen.getByText('Total');
    const totalValue = totalLabel.parentElement?.querySelector('.font-mono');
    expect(totalValue?.textContent).toBe('0');
  });

  it('calculates confidence based on recent trades', () => {
    const now = Date.now();
    const trades: TradeRecord[] = [
      { id: '1', timestamp: now, strategy: 'test', side: 'BUY', symbol: 'BTC', price: 100, size: 1, pnl: 100, dryRun: false },
      { id: '2', timestamp: now, strategy: 'test', side: 'BUY', symbol: 'BTC', price: 100, size: 1, pnl: 200, dryRun: false },
      { id: '3', timestamp: now, strategy: 'test', side: 'BUY', symbol: 'BTC', price: 100, size: 1, pnl: 300, dryRun: false },
      { id: '4', timestamp: now, strategy: 'test', side: 'BUY', symbol: 'BTC', price: 100, size: 1, pnl: 400, dryRun: false },
      { id: '5', timestamp: now, strategy: 'test', side: 'BUY', symbol: 'BTC', price: 100, size: 1, pnl: -50, dryRun: false },
    ];
    useTradingStore.getState().setTrades(trades);

    render(<DecisionAidsPanel />);
    // 4 wins out of 5 = 80%
    const winRateLabel = screen.getByText('Win Rate');
    const winRateValue = winRateLabel.parentElement?.querySelector('.font-mono');
    expect(winRateValue?.textContent).toBe('80%');
  });

  it('displays trade count correctly', () => {
    const now = Date.now();
    const trades: TradeRecord[] = [
      { id: '1', timestamp: now, strategy: 'test', side: 'BUY', symbol: 'BTC', price: 100, size: 1, pnl: 100, dryRun: false },
      { id: '2', timestamp: now, strategy: 'test', side: 'BUY', symbol: 'BTC', price: 100, size: 1, pnl: 200, dryRun: false },
    ];
    useTradingStore.getState().setTrades(trades);

    render(<DecisionAidsPanel />);
    const totalLabel = screen.getByText('Total');
    const totalValue = totalLabel.parentElement?.querySelector('.font-mono');
    expect(totalValue?.textContent).toBe('2');
  });

  it('limits confidence calculation to last 20 trades', () => {
    const now = Date.now();
    const trades: TradeRecord[] = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      timestamp: now,
      strategy: 'test',
      side: 'BUY' as const,
      symbol: 'BTC',
      price: 100,
      size: 1,
      pnl: 100, // all winning
      dryRun: false,
    }));
    useTradingStore.getState().setTrades(trades);

    render(<DecisionAidsPanel />);
    // Win rate should be 100% based on last 20
    const winRateLabel = screen.getByText('Win Rate');
    const winRateValue = winRateLabel.parentElement?.querySelector('.font-mono');
    expect(winRateValue?.textContent).toBe('100%');
    // Total displayed should be 20 (capped)
    const totalLabel = screen.getByText('Total');
    const totalValue = totalLabel.parentElement?.querySelector('.font-mono');
    expect(totalValue?.textContent).toBe('20');
  });
});
