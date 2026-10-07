import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, ISeriesApi } from 'lightweight-charts';
import { COLORS } from '../lib/stitch-design-tokens';
import { ShardTelemetryPoint } from './shard-ring-types';

interface ShardRingChartProps {
  data: ShardTelemetryPoint[];
  height?: number;
}

export function ShardRingChart({ data, height = 120 }: ShardRingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: COLORS.onSurfaceVariant,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)', style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: COLORS.primary, width: 1 },
        horzLine: { color: COLORS.primary, width: 1 },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addAreaSeries({
      lineColor: COLORS.primary,
      topColor: `${COLORS.primary}40`,
      bottomColor: `${COLORS.primary}00`,
      lineWidth: 2,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    if (data.length > 0) {
      series.setData(data);
      chart.timeScale().fitContent();
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [height]);

  useEffect(() => {
    if (seriesRef.current && chartRef.current && data.length > 0) {
      seriesRef.current.setData(data);
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div className="w-full relative">
      <div ref={containerRef} className="w-full" style={{ height }} />
    </div>
  );
}
