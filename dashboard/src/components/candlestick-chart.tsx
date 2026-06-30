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
    candlesRef.current = list;

    if (candleSeriesRef.current && volumeSeriesRef.current) {
      candleSeriesRef.current.setData(list);

      const volumeData = list.map((c) => {
        const isUp = c.close >= c.open;
        return {
          time: c.time,
          value: Math.abs(c.close - c.open) * (1000 + Math.random() * 500),
          color: isUp ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 46, 147, 0.25)',
        };
      });
      volumeSeriesRef.current.setData(volumeData);
    }
  }, [activePair]);

  // Handle price update tick in real-time using series.update()
  useEffect(() => {
    if (!tick || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    const midPrice = (tick.bid + tick.ask) / 2;
    const nowSeconds = Math.floor(tick.timestamp / 1000);
    const minuteSeconds = Math.floor(nowSeconds / 60) * 60;

    const prevCandles = candlesRef.current;
    if (prevCandles.length === 0) {
      const initialCandle = {
        time: minuteSeconds as unknown as Time,
        open: midPrice,
        high: midPrice,
        low: midPrice,
        close: midPrice,
      };
      candlesRef.current = [initialCandle];
      candleSeriesRef.current.setData([initialCandle]);
      return;
    }

    const last = prevCandles[prevCandles.length - 1];
    const isNewMinute = minuteSeconds > (last.time as unknown as number);

    let updatedBar: CandlestickData;
    if (isNewMinute) {
      updatedBar = {
        time: minuteSeconds as unknown as Time,
        open: last.close,
        high: Math.max(last.close, midPrice),
        low: Math.min(last.close, midPrice),
        close: midPrice,
      };
      candlesRef.current = [...prevCandles, updatedBar].slice(-200);
    } else {
      updatedBar = {
        ...last,
        high: Math.max(last.high, midPrice),
        low: Math.min(last.low, midPrice),
        close: midPrice,
      };
      candlesRef.current = [...prevCandles.slice(0, -1), updatedBar];
    }

    candleSeriesRef.current.update(updatedBar);

    const isUp = updatedBar.close >= updatedBar.open;
    const volumeBar = {
      time: updatedBar.time,
      value: Math.abs(updatedBar.close - updatedBar.open) * (1000 + Math.random() * 500),
      color: isUp ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 46, 147, 0.25)',
    };
    volumeSeriesRef.current.update(volumeBar);
  }, [tick]);

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
      color: '#00C8E8',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay volume on main chart
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
      const volumeData = candlesRef.current.map((c) => {
        const isUp = c.close >= c.open;
        return {
          time: c.time,
          value: Math.abs(c.close - c.open) * (1000 + Math.random() * 500),
          color: isUp ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 46, 147, 0.25)',
        };
      });
      volumeSeries.setData(volumeData);
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
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

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
