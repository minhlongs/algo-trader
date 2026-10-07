import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, ISeriesApi } from 'lightweight-charts';
import { useTradingStore } from '../stores/trading-store';
import {
  CandlestickData,
  generateInitialCandles,
  deriveVolumeData,
  calculateNextCandle,
  CYBER_CHART_THEME
} from './candlestick-chart-utils';

export function CandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [activePair, setActivePair] = useState<string>('binance:BTC/USDT');
  const tick = useTradingStore((s) => s.prices[activePair]);
  const [tickers, setTickers] = useState<string[]>([]);
  const candlesRef = useRef<CandlestickData[]>([]);

  // Get and track ticker list selectively
  useEffect(() => {
    setTickers(Object.keys(useTradingStore.getState().prices));
    const unsubscribe = useTradingStore.subscribe(
      (state) => {
        const keys = Object.keys(state.prices);
        setTickers((prev) => {
          if (prev.length === keys.length && prev.every((k, i) => k === keys[i])) {
            return prev;
          }
          return keys;
        });
      }
    );
    return unsubscribe;
  }, []);

  // Generate or regenerate initial candles when activePair changes
  useEffect(() => {
    const list = generateInitialCandles(100);
    candlesRef.current = list;

    if (candleSeriesRef.current && volumeSeriesRef.current) {
      candleSeriesRef.current.setData(list);
      volumeSeriesRef.current.setData(deriveVolumeData(list));
    }
  }, [activePair]);

  // Handle price update tick in real-time using series.update()
  useEffect(() => {
    if (!tick || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    const midPrice = (tick.bid + tick.ask) / 2;

    const { updatedList, updatedBar, volumeBar } = calculateNextCandle(
      candlesRef.current,
      midPrice,
      tick.timestamp
    );

    candlesRef.current = updatedList;
    candleSeriesRef.current.update(updatedBar);
    volumeSeriesRef.current.update(volumeBar);
  }, [tick]);

  // Set up chart and series
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height: 350,
      layout: {
        background: { type: ColorType.Solid, color: CYBER_CHART_THEME.background },
        textColor: CYBER_CHART_THEME.textColor,
        fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
      },
      grid: {
        vertLines: { color: CYBER_CHART_THEME.gridColor, style: LineStyle.Dotted },
        horzLines: { color: CYBER_CHART_THEME.gridColor, style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: CYBER_CHART_THEME.profit, width: 1, labelVisible: true },
        horzLine: { color: CYBER_CHART_THEME.profit, width: 1, labelVisible: true },
      },
      rightPriceScale: {
        borderColor: CYBER_CHART_THEME.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.3 },
      },
      timeScale: {
        borderColor: CYBER_CHART_THEME.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: CYBER_CHART_THEME.profit,
      downColor: CYBER_CHART_THEME.loss,
      borderUpColor: CYBER_CHART_THEME.profit,
      borderDownColor: CYBER_CHART_THEME.loss,
      wickUpColor: CYBER_CHART_THEME.profit,
      wickDownColor: CYBER_CHART_THEME.loss,
    });

    const volumeSeries = chart.addHistogramSeries({
      color: CYBER_CHART_THEME.primary,
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay volume
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    });

    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    chartRef.current = chart;

    // Load initial data on mount if available
    if (candlesRef.current.length > 0) {
      candleSeries.setData(candlesRef.current);
      volumeSeries.setData(deriveVolumeData(candlesRef.current));
    }

    // Responsive resize
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
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-semibold">Real-Time Chart</span>
          <select
            value={activePair}
            onChange={(e) => setActivePair(e.target.value)}
            className="bg-bg border border-white/5 rounded px-2.5 py-1 text-accent text-xs font-mono focus:outline-none focus:border-accent"
          >
            {tickers.length > 0 ? (
              tickers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))
            ) : (
              <option value="binance:BTC/USDT">binance:BTC/USDT</option>
            )}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-profit animate-pulse" />
          <span className="text-muted text-[10px] uppercase font-bold tracking-wider">WebSocket Stream</span>
        </div>
      </div>

      <div ref={containerRef} className="w-full flex-grow min-h-[350px]" />
    </div>
  );
}
