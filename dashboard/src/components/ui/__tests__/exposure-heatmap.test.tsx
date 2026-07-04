/**
 * Tests for ExposureHeatmap component
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExposureHeatmap } from '../exposure-heatmap';

const mockData = [
  { marketId: '1', marketName: 'BTC/USD', exposure: 50000, notional: 100000 },
  { marketId: '2', marketName: 'ETH/USD', exposure: -25000, notional: 50000 },
  { marketId: '3', marketName: 'SOL/USD', exposure: 10000, notional: 20000 },
];

describe('ExposureHeatmap', () => {
  it('renders all market items', () => {
    render(<ExposureHeatmap data={mockData} />);
    expect(screen.getByText('BTC/USD')).toBeDefined();
    expect(screen.getByText('ETH/USD')).toBeDefined();
    expect(screen.getByText('SOL/USD')).toBeDefined();
  });

  it('shows empty state when no data', () => {
    render(<ExposureHeatmap data={[]} />);
    expect(screen.getByText('No exposure data')).toBeDefined();
  });

  it('displays notional values', () => {
    render(<ExposureHeatmap data={mockData} />);
    expect(screen.getByText('$100,000')).toBeDefined();
    expect(screen.getByText('$50,000')).toBeDefined();
    expect(screen.getByText('$20,000')).toBeDefined();
  });

  it('displays exposure with sign', () => {
    render(<ExposureHeatmap data={mockData} />);
    expect(screen.getByText('+50000.00')).toBeDefined();
    expect(screen.getByText('-25000.00')).toBeDefined();
    expect(screen.getByText('+10000.00')).toBeDefined();
  });

  it('shows tooltip on hover', () => {
    render(<ExposureHeatmap data={mockData} />);
    const btcElement = screen.getByText('BTC/USD').closest('div')!;
    fireEvent.mouseEnter(btcElement);
    // Tooltip should appear in document
    expect(screen.getByText(/Exposure:/)).toBeDefined();
    expect(screen.getByText(/Notional:/)).toBeDefined();
  });

  it('hides tooltip on mouse leave', () => {
    render(<ExposureHeatmap data={mockData} />);
    const btcElement = screen.getByText('BTC/USD').closest('div')!;
    fireEvent.mouseEnter(btcElement);
    expect(screen.getByText(/Exposure:/)).toBeDefined();
    fireEvent.mouseLeave(btcElement);
    expect(screen.queryByText(/Exposure:/)).toBeNull();
  });

  it('applies custom maxExposure prop', () => {
    render(<ExposureHeatmap data={mockData} maxExposure={100000} />);
    // Should render without error
    expect(screen.getByText('BTC/USD')).toBeDefined();
  });
});
