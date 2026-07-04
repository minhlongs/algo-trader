/**
 * Horizontal scrollable strip showing real-time bid/ask prices per exchange:symbol.
 * Flashes green on price increase, red on decrease.
 */
import { useRef } from 'react';
import { useTradingStore } from '../stores/trading-store';

interface TickerPrevState {
  mid: number;
  flash: 'up' | 'down' | null;
  timestamp: number;
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function spreadBps(bid: number, ask: number): string {
  if (bid <= 0) return '—';
  return ((ask - bid) / bid * 10000).toFixed(1) + 'bps';
}

export function PriceTickerStrip() {
  const prices = useTradingStore((s) => s.prices);
  const prevRef = useRef<Record<string, TickerPrevState>>({});

  const entries = Object.values(prices);

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-muted text-xs font-mono">
        <span className="animate-pulse">Waiting for price data...</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="flex gap-3 px-1 py-1 min-w-max">
        {entries.map((tick) => {
          const key = `${tick.exchange}:${tick.symbol}`;
          const mid = (tick.bid + tick.ask) / 2;
          const prev = prevRef.current[key];

          let flash: 'up' | 'down' | null = null;
          if (prev !== undefined) {
            if (tick.timestamp !== prev.timestamp) {
              if (mid > prev.mid) {
                flash = 'up';
              } else if (mid < prev.mid) {
                flash = 'down';
              } else {
                flash = prev.flash;
              }
            } else {
              flash = prev.flash;
            }
          }

          // Save current state to ref for the next render
          prevRef.current[key] = { mid, flash, timestamp: tick.timestamp };

          const flashClass =
            flash === 'up'
              ? 'flash-up-anim border-profit/40'
              : flash === 'down'
              ? 'flash-down-anim border-loss/40'
              : 'bg-bg-card border-bg-border';

          return (
            <div
              key={key}
              className={`
                flex flex-col gap-0.5 px-3 py-2 rounded border
                min-w-[140px] ${flashClass}
              `}
            >
              {/* Header: exchange + symbol */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-accent text-xs font-mono font-bold truncate">
                  {tick.exchange}
                </span>
                <span className="text-white text-xs font-mono font-semibold">
                  {tick.symbol}
                </span>
              </div>

              {/* Bid / Ask */}
              <div className="flex gap-2 text-xs font-mono">
                <span className={`${flash === 'up' ? 'text-profit' : flash === 'down' ? 'text-loss' : 'text-white'}`}>
                  B {formatPrice(tick.bid)}
                </span>
                <span className="text-muted">|</span>
                <span className={`${flash === 'up' ? 'text-profit' : flash === 'down' ? 'text-loss' : 'text-muted'}`}>
                  A {formatPrice(tick.ask)}
                </span>
              </div>

              {/* Spread */}
              <div className="text-muted text-[10px] font-mono">
                {spreadBps(tick.bid, tick.ask)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
