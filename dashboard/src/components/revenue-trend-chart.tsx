/**
 * Revenue Trend Chart
 *
 * Line chart showing MRR trend over time using lightweight-charts.
 * Displays revenue growth/decline with color-coded line.
 */
import { useEffect, useRef, useMemo } from 'react';
import { COLORS } from '../lib/stitch-design-tokens';
import { createChart, IChartApi, ISeriesApi, BusinessDay, ColorType } from 'lightweight-charts';

interface TrendDataPoint {
  month: string;
  totalMRR: number;
  growthRate?: number;
}

interface RevenueTrendChartProps {
  data: TrendDataPoint[];
  height?: number;
  className?: string;
}

export function RevenueTrendChart({
  data,
  height = 280,
  className = '',
}: RevenueTrendChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // Format dates for lightweight-charts
  const chartData = useMemo(() => {
    return data.map((point) => {
      // Convert YYYY-MM to BusinessDay format
      const [year, month] = point.month.split('-').map(Number);
      return {
        time: { year, month, day: 1 } as BusinessDay,
        value: point.totalMRR,
      };
    });
  }, [data]);

  // Chart configuration
  const chartOptions = useMemo(() => ({
    layout: {
      background: { type: ColorType.Solid as const, color: `${COLORS.surface}` },
      textColor: `${COLORS.onSurfaceVariant}`,
    },
    grid: {
      vertLines: { color: 'rgba(48, 54, 61, 0.3)' },
      horzLines: { color: 'rgba(48, 54, 61, 0.3)' },
    },
    crosshair: {
      mode: 1 as const,
    },
    rightPriceScale: {
      borderColor: 'rgba(48, 54, 61, 0.5)',
    },
    timeScale: {
      borderColor: 'rgba(48, 54, 61, 0.5)',
      timeVisible: true,
    },
  }), []);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const initialWidth = container.clientWidth > 0 ? container.clientWidth : undefined;

    // Create chart
    const chart = createChart(container, {
      ...chartOptions,
      width: initialWidth,
      height,
    });

    chartRef.current = chart;

    // Create area series for MRR trend
    const series = chart.addAreaSeries({
      lineColor: `${COLORS.primary}`,
      topColor: 'rgba(88, 166, 255, 0.3)',
      bottomColor: 'rgba(88, 166, 255, 0)',
      lineWidth: 2,
      pointMarkersVisible: true,
      pointMarkersRadius: 4,
    });

    seriesRef.current = series;

    if (chartData.length > 0) {
      series.setData(chartData);
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        chart.timeScale().fitContent();
      }
    }

    // Cleanup
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartOptions, height]);

  // Update data when it changes
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!series || !chart) return;

    if (chartData.length > 0) {
      series.setData(chartData);
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        chart.timeScale().fitContent();
      }
    } else {
      series.setData([]);
    }
  }, [chartData]);

  // Handle resize with zero-dimension guards
  useEffect(() => {
    const container = chartContainerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        chart.applyOptions({
          width: entry.contentRect.width,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`bg-bg-secondary border border-bg-border rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-lg">MRR Trend</h3>
          <p className="text-muted text-xs mt-0.5">Monthly Recurring Revenue over time</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-accent/40"></span>
          <span className="text-xs text-muted">MRR (USD)</span>
        </div>
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} className="w-full" style={{ height }} />

      {/* Empty state */}
      {data.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted text-sm">
          No trend data available
        </div>
      )}
    </div>
  );
}
