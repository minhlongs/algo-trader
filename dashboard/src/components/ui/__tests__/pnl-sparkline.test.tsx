/**
 * Tests for PnlSparkline component
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PnlSparkline } from '../pnl-sparkline';

describe('PnlSparkline', () => {
  it('renders with data', () => {
    const { container } = render(<PnlSparkline values={[100, 150, 200, 180, 220]} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
  });

  it('shows empty state when no values', () => {
    render(<PnlSparkline values={[]} />);
    expect(screen.getByText('No data')).toBeDefined();
  });

  it('renders polyline with correct number of points', () => {
    const values = [10, 20, 30, 40, 50];
    const { container } = render(<PnlSparkline values={values} width={200} height={60} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeDefined();
    const points = polyline?.getAttribute('points')?.split(' ');
    expect(points?.length).toBe(values.length);
  });

  it('displays current value dot when showCurrent is true', () => {
    const { container } = render(<PnlSparkline values={[100, 200]} showCurrent={true} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(1);
  });

  it('does not display current dot when showCurrent is false', () => {
    const { container } = render(<PnlSparkline values={[100, 200]} showCurrent={false} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(0);
  });

  it('renders threshold line when maxLossPerTrade is provided', () => {
    const { container } = render(<PnlSparkline values={[100, 200, 150]} maxLossPerTrade={50} />);
    const thresholdLines = container.querySelectorAll('line[stroke-dasharray]');
    expect(thresholdLines.length).toBeGreaterThan(0);
  });

  it('does not render threshold line when not provided', () => {
    const { container } = render(<PnlSparkline values={[100, 200]} />);
    const thresholdLines = container.querySelectorAll('line[stroke-dasharray]');
    expect(thresholdLines.length).toBe(0);
  });

  it('uses correct dimensions', () => {
    const { container } = render(<PnlSparkline values={[10, 20, 30]} width={300} height={80} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '300');
    expect(svg).toHaveAttribute('height', '80');
  });

  it('handles negative values', () => {
    const values = [-50, -20, 0, 20, 50];
    const { container } = render(<PnlSparkline values={values} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeDefined();
  });

  it('handles single value', () => {
    const { container } = render(<PnlSparkline values={[100]} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeDefined();
  });
});
