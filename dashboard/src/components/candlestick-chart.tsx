import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, ISeriesApi, Time } from 'lightweight-charts';
import { useTradingStore } from '../stores/trading-store';

export interface CandlestickData {
  time: Time; // UTCTimestamp in seconds or string
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeData {
  time: Time;
  value: number;
  color: string;
}

export function CandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const prices = useTradingStore((s) => s.prices);
  const [activePair, setActivePair] = useState<string>('binance:BTC/USDT');

  // Maintain candle history in state
  const [candles, setCandles] = useState<CandlestickData[]>(() => {
    // Generate initial mock history for visual excellence
    const list: CandlestickData[] = [];
    const now = Math.floor(Date.now() / 1000);
    let close = 50000;
    for (let i = 100; i >= 0; i--) {
      const open = close + (Math.random() - 0.5) * 100;
      const high = Math.max(open, close) + Math.random() * 50;
      const low = Math.min(open, close) - Math.random() * 50;
      close = open + (Math.random() - 0.5) * 100;
      list.push({
        time: (now - i * 60) as unknown as Time,
        open,
        high,
        low,
        close,
      });
    }
    return list;
  });

  // Track ticker options
  const tickers = Object.keys(prices);

  // Monitor latest price tick to update last candle or insert new one
  useEffect(() => {
    const tick = prices[activePair];
    if (!tick) return;

    const midPrice = (tick.bid + tick.ask) / 2;
    const nowSeconds = Math.floor(tick.timestamp / 1000);
    const minuteSeconds = Math.floor(nowSeconds / 60) * 60;

    setCandles((prev) => {
      if (prev.length === 0) {
        return [{
          time: minuteSeconds as unknown as Time,
          open: midPrice,
          high: midPrice,
          low: midPrice,
          close: midPrice,
        }];
      }

      const last = prev[prev.length - 1];
      const isNewMinute = minuteSeconds > (last.time as unknown as number);

      if (isNewMinute) {
        // Start a new candle
        return [
          ...prev,
          {
            time: minuteSeconds as unknown as Time,
            open: last.close,
            high: Math.max(last.close, midPrice),
            low: Math.min(last.close, midPrice),
            close: midPrice,
          },
        ].slice(-200); // Keep last 200 candles
      } else {
        // Update the last candle
        const updated = {
          ...last,
          high: Math.max(last.high, midPrice),
          low: Math.min(last.low, midPrice),
          close: midPrice,
        };
        return [...prev.slice(0, -1), updated];
      }
    });
  }, [prices, activePair]);

  // Set up chart and series
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height: 350,
      layout: {
        background: { type: ColorType.Solid, color: '#101426' },
        textColor: '#8892B0',
        fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)', style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: '#00FFA3', width: 1, labelVisible: true },
        horzLine: { color: '#00FFA3', width: 1, labelVisible: true },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        scaleMargins: { top: 0.1, bottom: 0.3 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00FFA3',
      downColor: '#FF2E93',
      borderUpColor: '#00FFA3',
      borderDownColor: '#FF2E93',
      wickUpColor: '#00FFA3',
      wickDownColor: '#FF2E93',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#00D9FF',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay volume on main chart
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    });

    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    chartRef.current = chart;

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
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update chart data whenever state changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    candleSeriesRef.current.setData(candles);

    // Build volume histogram
    const volumeData: VolumeData[] = candles.map((c) => {
      const isUp = c.close >= c.open;
      return {
        time: c.time,
        value: Math.abs(c.close - c.open) * (1000 + Math.random() * 500),
        color: isUp ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 46, 147, 0.25)',
      };
    });
    volumeSeriesRef.current.setData(volumeData);
  }, [candles]);

  return (
    <div className="flex flex-col h-full">
      {/* Chart controls */}
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
