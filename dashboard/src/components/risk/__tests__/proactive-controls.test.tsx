/**
 * Tests for ProactiveControlsPanel and forms
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRiskPreferencesStore } from '../../../stores/risk-preferences-store';
import { AutoCloseForm } from '../auto-close-form';
import { CircuitBreakerForm } from '../circuit-breaker-form';
import { ProactiveControlsPanel } from '../ProactiveControlsPanel';

// Helper to reset store
const resetStore = () => {
  useRiskPreferencesStore.getState().resetPreferences();
};

describe('AutoCloseForm', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders all inputs', () => {
    render(<AutoCloseForm />);
    expect(screen.getByLabelText(/Profit Target/i)).toBeDefined();
    expect(screen.getByLabelText(/Stop Loss/i)).toBeDefined();
    expect(screen.getByLabelText(/Trailing Stop/i)).toBeDefined();
    expect(screen.getByText(/Enable Auto-Close/i)).toBeDefined();
  });

  it('allows toggling auto-close enabled', () => {
    render(<AutoCloseForm />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    // Verify store updated
    expect(useRiskPreferencesStore.getState().autoCloseEnabled).toBe(true);
  });

  it('shows validation error when profit target <= stop loss', async () => {
    render(<AutoCloseForm />);
    // Enable auto-close
    fireEvent.click(screen.getByRole('checkbox'));

    // Set profit = 5, stop = 10
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '5' } });
    fireEvent.change(inputs[1], { target: { value: '10' } });

    const saveButton = screen.getByText(/Save Settings/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Profit target must be greater than stop loss/i)).toBeDefined();
    });
  });

  it('saves settings successfully', async () => {
    render(<AutoCloseForm />);
    fireEvent.click(screen.getByRole('checkbox'));

    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '10' } });
    fireEvent.change(inputs[1], { target: { value: '5' } });
    fireEvent.change(inputs[2], { target: { value: '2' } });

    const saveButton = screen.getByText(/Save Settings/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      const state = useRiskPreferencesStore.getState();
      expect(state.autoCloseEnabled).toBe(true);
      expect(state.profitTargetPercent).toBeCloseTo(0.10, 2);
      expect(state.stopLossPercent).toBeCloseTo(0.05, 2);
      expect(state.trailingStopPercent).toBeCloseTo(0.02, 2);
    });
  });
});

describe('CircuitBreakerForm', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders all inputs', () => {
    render(<CircuitBreakerForm />);
    expect(screen.getByLabelText(/Max Drawdown/i)).toBeDefined();
    expect(screen.getByLabelText(/Consecutive Losses/i)).toBeDefined();
    expect(screen.getByLabelText(/Cooldown/i)).toBeDefined();
    expect(screen.getByText(/Enable Circuit Breaker/i)).toBeDefined();
  });

  it('allows toggling circuit breaker enabled', () => {
    render(<CircuitBreakerForm />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(useRiskPreferencesStore.getState().circuitBreakerEnabled).toBe(true);
  });

  it('validates required fields', async () => {
    render(<CircuitBreakerForm />);
    fireEvent.click(screen.getByRole('checkbox'));

    const inputs = screen.getAllByRole('spinbutton');
    // Set valid drawdown, leave others empty
    fireEvent.change(inputs[0], { target: { value: '10' } });
    fireEvent.change(inputs[1], { target: { value: '' } }); // consecutive losses empty
    fireEvent.change(inputs[2], { target: { value: '' } }); // cooldown empty

    fireEvent.click(screen.getByText(/Save Settings/i));

    await waitFor(() => {
      // Should show error for consecutive losses (positive number)
      expect(screen.getByText(/Consecutive losses must be a positive number/i)).toBeDefined();
    });
  });

  it('saves settings successfully', async () => {
    render(<CircuitBreakerForm />);
    fireEvent.click(screen.getByRole('checkbox'));

    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '15' } }); // drawdown 15%
    fireEvent.change(inputs[1], { target: { value: '5' } }); // consecutive losses
    fireEvent.change(inputs[2], { target: { value: '30' } }); // cooldown minutes

    fireEvent.click(screen.getByText(/Save Settings/i));

    await waitFor(() => {
      const state = useRiskPreferencesStore.getState();
      expect(state.circuitBreakerEnabled).toBe(true);
      expect(state.maxDrawdownPercent).toBeCloseTo(0.15, 2);
      expect(state.maxConsecutiveLosses).toBe(5);
      expect(state.cooldownPeriodMinutes).toBe(30);
    });
  });
});

describe('ProactiveControlsPanel', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders both forms', () => {
    render(<ProactiveControlsPanel />);
    // Check for unique labels
    expect(screen.getByText('Enable Auto-Close')).toBeDefined();
    expect(screen.getByText('Enable Circuit Breaker')).toBeDefined();
  });

  it('shows status indicators', () => {
    render(<ProactiveControlsPanel />);
    const inactiveElements = screen.getAllByText('INACTIVE');
    expect(inactiveElements.length).toBeGreaterThanOrEqual(2); // two statuses
  });

  it('displays open positions count', () => {
    render(<ProactiveControlsPanel />);
    expect(screen.getByText('Open Positions')).toBeDefined();
  });

  it('displays total P&L', () => {
    render(<ProactiveControlsPanel />);
    expect(screen.getByText('Total P&L')).toBeDefined();
  });
});
