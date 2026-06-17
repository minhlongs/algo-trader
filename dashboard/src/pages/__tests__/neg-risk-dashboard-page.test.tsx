/**
 * Tests for NegRiskDashboardPage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NegRiskDashboardPage } from '../neg-risk-dashboard-page';

// Mock fetch to avoid network calls
beforeEach(() => {
vi.stubGlobal('fetch', vi.fn(() =>
Promise.reject(new Error('Network error'))
));
});

describe('NegRiskDashboardPage', () => {
it('renders header with CashClaw logo', () => {
render(<NegRiskDashboardPage />);
expect(screen.getByText('CashClaw')).toBeDefined();
expect(screen.getByText('Negative Risk Scanner')).toBeDefined();
});

it('renders 3 stat cards', () => {
render(<NegRiskDashboardPage />);
expect(screen.getByText('Opportunities Found')).toBeDefined();
const lockedProfitLabels = screen.getAllByText('Locked Profit');
expect(lockedProfitLabels.length).toBeGreaterThanOrEqual(1);
expect(screen.getByText('Active Trades')).toBeDefined();
});

it('renders table with demo data after fetch fails', async () => {
render(<NegRiskDashboardPage />);
await waitFor(() => {
expect(screen.getByText('BTC > $100K by 2026')).toBeDefined();
}, { timeout: 3000 });
});

it('renders threshold slider with default 0.98', () => {
render(<NegRiskDashboardPage />);
const slider = screen.getByRole('slider');
expect(slider).toBeDefined();
expect((slider as HTMLInputElement).value).toBe('0.98');
});

it('updates threshold on slider change', () => {
render(<NegRiskDashboardPage />);
const slider = screen.getByRole('slider');
fireEvent.change(slider, { target: { value: '0.95' } });
expect((slider as HTMLInputElement).value).toBe('0.95');
});

it('renders Trade buttons for each opportunity', async () => {
render(<NegRiskDashboardPage />);
await waitFor(() => {
const buttons = screen.getAllByText('Trade');
expect(buttons.length).toBeGreaterThan(0);
}, { timeout: 3000 });
});

it('renders control panel with refresh button', () => {
render(<NegRiskDashboardPage />);
expect(screen.getByText('Control Panel')).toBeDefined();
});
});
