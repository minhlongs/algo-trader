/**
 * Reusable TradingView lightweight-charts line chart with dark theme.
 * Auto-resizes via ResizeObserver, cleans up on unmount.
 */
import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, ISeriesApi } from 'lightweight-charts';

export interface ChartDataPoint {
  time: string;
  value: number;
}

interface PriceChartProps {
  data?: ChartDataPoint[];
  height?: number;
  color?: string;
  title?: string;
}

const CHART_COLORS = {
  background: '#080B14',
  text: '#8892B0',
  grid: '#1E2640',
  crosshair: '#00C8E8',
} as const;

export function PriceChartLightweight({
  data,
  height = 300,
  color = '#00C8E8',
  title,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // 1. Initialize chart instance once on mount/resize options
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
        fontFamily: 'Menlo, Monaco, Courier New, monospace',
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid, style: LineStyle.Dotted },
        horzLines: { color: CHART_COLORS.grid, style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: CHART_COLORS.crosshair, width: 1 },
        horzLine: { color: CHART_COLORS.crosshair, width: 1 },
      },
      rightPriceScale: { borderColor: CHART_COLORS.grid },
      timeScale: { borderColor: CHART_COLORS.grid, timeVisible: true },
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: `${color}00`,
      lineWidth: 2,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, color]);

  // 2. Separate data updating effect
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    if (data && data.length > 0) {
      series.setData(data);
      chart.timeScale().fitContent();
    } else {
      series.setData([]);
    }
  }, [data]);

  const hasData = data && data.length > 0;

  return (
    <div className="relative w-full">
      {title && (
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1">{title}</p>
      )}
      <div ref={containerRef} style={{ height }} className="w-full" />
      {!hasData && (
        <div
          className="absolute inset-0 flex items-center justify-center text-muted text-xs"
          style={{ top: title ? '1.25rem' : 0 }}
        >
          No chart data
        </div>
      )}
    </div>
  );
}
