/**
 * Tests for RiskGauge component
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskGauge } from '../risk-gauge';
import { COLORS } from '../../../lib/stitch-design-tokens';

describe('RiskGauge', () => {
  it('renders with default props', () => {
    render(<RiskGauge value={0.5} threshold={0.8} />);
    // Check that percentage text is shown
    expect(screen.getByText('50%')).toBeDefined();
  });

  it('renders with label', () => {
    render(<RiskGauge value={0.3} threshold={0.5} label="Portfolio Risk" />);
    expect(screen.getByText('Portfolio Risk')).toBeDefined();
  });

  it('displays correct percentage for zero value', () => {
    render(<RiskGauge value={0} threshold={0.5} />);
    expect(screen.getByText('0%')).toBeDefined();
  });

  it('displays correct percentage for full value', () => {
    render(<RiskGauge value={1} threshold={0.8} />);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('renders SVG element', () => {
    const { container } = render(<RiskGauge value={0.6} threshold={0.7} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
  });

  it('applies size classes correctly', () => {
    const { container, rerender } = render(<RiskGauge value={0.5} threshold={0.8} size="sm" />);
    let svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '120');
    expect(svg).toHaveAttribute('height', '60');

    rerender(<RiskGauge value={0.5} threshold={0.8} size="lg" />);
    svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '240');
    expect(svg).toHaveAttribute('height', '120');
  });

  it('uses correct color for low risk value', () => {
    render(<RiskGauge value={0.2} threshold={0.8} />);
    const percentage = screen.getByText('20%');
    expect(percentage).toHaveStyle({ color: COLORS.profit });
  });

  it('uses correct color for medium risk value', () => {
    render(<RiskGauge value={0.5} threshold={0.8} />);
    const percentage = screen.getByText('50%');
    expect(percentage).toHaveStyle({ color: COLORS.warning });
  });

  it('uses correct color for high risk value', () => {
    render(<RiskGauge value={0.8} threshold={0.8} />);
    const percentage = screen.getByText('80%');
    expect(percentage).toHaveStyle({ color: COLORS.loss });
  });
});
