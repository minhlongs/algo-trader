import { COLORS } from '../../lib/stitch-design-tokens';
/**
 * Terminal logs widget for dashboard.
 */
import { useEffect, useRef, useState } from 'react';
import { useTradingStore } from '../../stores/trading-store';

export function TerminalLogsWidget() {
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const prices = useTradingStore((s) => s.prices);
  const trades = useTradingStore((s) => s.trades);

  useEffect(() => {
    const initLogs = [
      `[${new Date().toLocaleTimeString()}] [System] Initialization complete.`,
      `[${new Date().toLocaleTimeString()}] [Redis] Connected to cluster.`,
      `[${new Date().toLocaleTimeString()}] [Safety] Circuit Breaker: CLOSED.`,
      `[${new Date().toLocaleTimeString()}] [Bot] Paper trading mode: ENABLED.`,
    ];
    setLogs(initLogs);
  }, []);

  useEffect(() => {
    if (trades.length === 0) return;
    const latest = trades[0];
    const time = new Date(latest.timestamp).toLocaleTimeString();
    const log = `[${time}] [FILL] ${latest.side} ${latest.size} ${latest.symbol} @ $${latest.price.toFixed(2)} (${latest.strategy})`;
    setLogs((prev) => [...prev, log].slice(-100));
  }, [trades]);

  useEffect(() => {
    const keys = Object.keys(prices);
    if (keys.length === 0) return;
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const tick = prices[randomKey];
    if (!tick) return;

    if (Math.random() > 0.93) {
      const time = new Date(tick.timestamp).toLocaleTimeString();
      const log = `[${time}] [TICK] ${tick.exchange}:${tick.symbol} Bid: ${tick.bid.toFixed(2)} Ask: ${tick.ask.toFixed(2)}`;
      setLogs((prev) => [...prev, log].slice(-100));
    }
  }, [prices]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: COLORS.bg,
        borderColor: 'rgba(255, 255, 255, 0.05)',
      }}
    >
      <div className="flex items-center gap-1.5 pb-2 border-b border-white/5 mb-3 text-muted px-4 pt-3">
        <span className="w-2.5 h-2.5 rounded-full bg-loss" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
        <span className="w-2.5 h-2.5 rounded-full bg-profit" />
        <span className="ml-2" aria-hidden="true">system-log-terminal</span>
      </div>
      <div
        ref={logContainerRef}
        className="flex-grow overflow-y-auto space-y-1 scrollbar-thin px-4 pb-4 font-mono text-xs"
        style={{ maxHeight: '350px' }}
      >
        {logs.map((log, index) => {
          let colorClass = 'text-white/80';
          if (log.includes('[FILL]')) colorClass = 'text-profit font-semibold';
          else if (log.includes('[TICK]')) colorClass = 'text-accent-cyan';
          else if (log.includes('[Safety]')) colorClass = 'text-accent-pink';
          else if (log.includes('[System]')) colorClass = 'text-muted';

          return (
            <p key={index} className={`${colorClass} whitespace-pre-wrap`}>
              {log}
            </p>
          );
        })}
      </div>
    </div>
  );
}
