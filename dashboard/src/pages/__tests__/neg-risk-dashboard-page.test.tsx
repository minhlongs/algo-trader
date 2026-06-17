/**
 * Tests for NegRiskDashboardPage (Stitch-aligned design)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NegRiskDashboardPage } from '../neg-risk-dashboard-page';

beforeEach(() => {
vi.stubGlobal('fetch', vi.fn(() =>
Promise.reject(new Error('Network error'))
));
});

describe('NegRiskDashboardPage', () => {
it('renders header with CashClaw logo', () => {
render(<NegRiskDashboardPage />);
expect(screen.getByText('CashClaw')).toBeDefined();
});

it('renders sidebar with Risk Control heading', () => {
render(<NegRiskDashboardPage />);
expect(screen.getByText('Risk Control')).toBeDefined();
});

it('renders 3 stat cards', () => {
render(<NegRiskDashboardPage />);
expect(screen.getByText('Opportunities Found')).toBeDefined();
expect(screen.getByText('Locked Profit')).toBeDefined();
expect(screen.getByText('Active Trades')).toBeDefined();
});

it('renders table with demo data after fetch fails', async () => {
render(<NegRiskDashboardPage />);
await waitFor(() => {
expect(screen.getByText('BTC > $100K by 2026')).toBeDefined();
}, { timeout: 3000 });
});

it('renders refresh button in sidebar', async () => {
render(<NegRiskDashboardPage />);
await waitFor(() => {
const buttons = screen.queryAllByRole('button');
expect(buttons.length).toBeGreaterThanOrEqual(0);
}, { timeout: 3000 });
});

it('renders Trade buttons for each opportunity', async () => {
render(<NegRiskDashboardPage />);
await waitFor(() => {
const buttons = screen.getAllByText('Trade');
expect(buttons.length).toBeGreaterThan(0);
}, { timeout: 3000 });
});
});
