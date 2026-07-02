/**
 * CashClaw Trade Start Handler — Starts the live/paper trading orchestrator.
 *
 * Sets up signal handlers, starts the orchestrator + Endgame scanner,
 * and runs a status loop until the orchestrator stops.
 * Extracted from cashclaw-trade-commands.ts to keep files under 200 lines.
 */
import * as readline from 'readline';

const REQUIRED_VARS: Array<{ newName: string; oldName: string }> = [
  { newName: 'POLYMARKET_API_KEY', oldName: 'POLY_API_KEY' },
  { newName: 'POLYMARKET_API_SECRET', oldName: 'POLY_API_SECRET' },
  { newName: 'POLYMARKET_PASSPHRASE', oldName: 'POLY_PASSPHRASE' },
  { newName: 'POLYMARKET_PRIVATE_KEY', oldName: 'POLY_PRIVATE_KEY' },
];

export async function handleTradeStart(opts: {
  mode: string; capital: string; strategy: string; yes: boolean;
}): Promise<void> {
  const capitalUsdc = parseFloat(opts.capital);
  if (isNaN(capitalUsdc) || capitalUsdc <= 0) {
    console.error('Error: --capital must be a positive number');
    process.exit(1);
  }

  const isLive = opts.mode === 'live';

  if (isLive) {
    const missing = REQUIRED_VARS.filter(({ newName, oldName }) => !process.env[newName] && !process.env[oldName]);
    if (missing.length > 0) {
      const names = missing.map(({ newName, oldName }) => `${newName} (or ${oldName})`);
      console.error(`Cannot start LIVE trading. Missing env vars: ${names.join(', ')}`);
      console.error('Set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_PASSPHRASE, POLYMARKET_PRIVATE_KEY in your .env or use --mode=paper for simulation.');
      process.exit(1);
    }

    if (!opts.yes) {
      console.log('⚠️  LIVE TRADING: This will use REAL USDC on Polymarket.');
      console.log(`   Capital: $${capitalUsdc} | Strategy: ${opts.strategy}`);
      console.log('   Risk gates: 2% max position, 5% daily loss, 10 max positions, 3-loss circuit breaker');

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question('\nConfirm? (y/N): ', resolve);
      });
      rl.close();

      if (!answer.toLowerCase().startsWith('y')) {
        console.log('Aborted.');
        process.exit(0);
      }
    }
  }

  const modeLabel = isLive ? 'LIVE' : 'PAPER';
  console.log(`\nCashClaw ${modeLabel} Trading`);
  console.log(`Mode: ${modeLabel} | Capital: $${capitalUsdc} | Strategy: ${opts.strategy}`);
  console.log('Starting... (Ctrl+C to stop)\n');

  const { LiveTradingOrchestrator } = await import('../polymarket/live-trading-orchestrator');
  const { StrategyLiveBridge } = await import('../polymarket/strategy-live-bridge');
  const orch = new LiveTradingOrchestrator({
    paperTrading: !isLive,
    capitalUsdc,
  });
  const bridge = new StrategyLiveBridge(orch);

  const shutdown = async () => {
    console.log('\nShutting down...');
    bridge.stopScanner();
    await orch.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await orch.start();
  bridge.startEndgameScanner({ capitalUsdc, scanIntervalMs: 30_000 });
  console.log(`Orchestrator running (${modeLabel}). Press Ctrl+C to stop.`);
  console.log('Endgame scanner active — scanning every 30s for high-probability markets.\n');

  const statusInterval = setInterval(() => {
    const summary = orch.getPositionSummary();
    const guard = orch.getGuardStatus();
    const stats = bridge.getStats();
    console.log(
      `[${new Date().toISOString().slice(11, 19)}] ` +
      `Scans: ${stats.scansCompleted} | Signals: ${stats.signalsProcessed} (${stats.signalsRejected} rejected) | ` +
      `Positions: ${summary.positionCount} | Unrealized: $${summary.totalUnrealizedPnl.toFixed(2)} | ` +
      `Realized: $${summary.totalRealizedPnl.toFixed(2)} | ` +
      `Guard: ${guard.enabled ? 'ON' : 'OFF'} | Circuit: ${guard.circuitTripped ? 'TRIPPED' : 'OK'}`,
    );
  }, 60_000);

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (orch.getStatus() === 'stopped' || orch.getStatus() === 'error') {
        clearInterval(check);
        clearInterval(statusInterval);
        resolve();
      }
    }, 1000);
  });
}
