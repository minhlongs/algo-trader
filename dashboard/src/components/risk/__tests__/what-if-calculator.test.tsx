/**
 * Tests for WhatIfCalculator
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WhatIfCalculator } from '../WhatIfCalculator';
import { useRiskPreferencesStore } from '../../../stores/risk-preferences-store';

const resetStore = () => {
  useRiskPreferencesStore.getState().resetPreferences();
};

describe('WhatIfCalculator', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders calculator with empty state', () => {
    render(<WhatIfCalculator />);
    expect(screen.getByLabelText(/Position Size/i)).toBeDefined();
    expect(screen.getByText(/Enter a position size to see estimated outcomes/i)).toBeDefined();
  });

  it('shows estimated outcomes when position size is entered', () => {
    render(<WhatIfCalculator />);
    const input = screen.getByLabelText(/Position Size/i);
    fireEvent.change(input, { target: { value: '1000' } });

    expect(screen.getByText('Potential Profit')).toBeDefined();
    expect(screen.getByText('Potential Loss')).toBeDefined();
    expect(screen.getByText('Risk/Reward Ratio')).toBeDefined();
  });

  it('calculates potential profit and loss based on default risk preferences', () => {
    render(<WhatIfCalculator />);
    const input = screen.getByLabelText(/Position Size/i);
    fireEvent.change(input, { target: { value: '1000' } });

    // Default: profitTargetPercent = 0.05 (5%), stopLossPercent = 0.03 (3%)
    // Profit = 1000 * 0.05 = 50
    // Loss = 1000 * 0.03 = 30
    // Risk/Reward = 50/30 ≈ 1.67
    expect(screen.getByText('$50.00')).toBeDefined();
    expect(screen.getByText('$30.00')).toBeDefined();
    expect(screen.getByText('1.67')).toBeDefined();
  });

  it('shows zero values for position size 0', () => {
    render(<WhatIfCalculator />);
    const input = screen.getByLabelText(/Position Size/i);
    fireEvent.change(input, { target: { value: '0' } });

    // Both profit and loss should be $0.00, ratio 0.00
    const zeroDollars = screen.getAllByText('$0.00');
    expect(zeroDollars.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('0.00')).toBeDefined();
  });

  it('handles fractional position sizes', () => {
    render(<WhatIfCalculator />);
    const input = screen.getByLabelText(/Position Size/i);
    fireEvent.change(input, { target: { value: '1234.56' } });

    // 1234.56 * 0.05 = 61.728 -> $61.73
    // 1234.56 * 0.03 = 37.0368 -> $37.04
    // Ratio ≈ 1.6667 -> 1.67
    expect(screen.getByText('$61.73')).toBeDefined();
    expect(screen.getByText('$37.04')).toBeDefined();
    expect(screen.getByText('1.67')).toBeDefined();
  });
});
