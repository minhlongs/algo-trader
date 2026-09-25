/**
 * Alpha-Lab Autonomous Pipeline Context & Core Config
 */

import { join } from 'node:path';
import { DEFAULT_LEDGER_PATH } from '../provenance/research-ledger';
import type { AlphaLabAutonomousPipelineConfig } from './alpha-lab-pipeline-types';
import { createPipelineSubsystems, type PipelineSubsystems } from './alpha-lab-pipeline-factory';
import { PipelineStateManager } from './alpha-lab-pipeline-state';

export interface PipelineCoreContext {
  symbol: string;
  timeframe: string;
  initialBalanceUsd: number;
  ledgerPath: string;
  runCardDir: string;
  strictLedgerVerification: boolean;
  subsystems: PipelineSubsystems;
  state: PipelineStateManager;
}

export function initPipelineCoreContext(config?: AlphaLabAutonomousPipelineConfig): PipelineCoreContext {
  const symbol = config?.symbol ?? 'BTC/USDT';
  const timeframe = config?.timeframe ?? '1h';
  const initialBalanceUsd = config?.initialBalanceUsd ?? 100_000;
  const ledgerPath = config?.ledgerPath ?? DEFAULT_LEDGER_PATH;
  const runCardDir = config?.runCardDir ?? join('data', 'run-cards');
  const strictLedgerVerification = config?.strictLedgerVerification ?? true;

  const subsystems = createPipelineSubsystems(
    symbol,
    timeframe,
    initialBalanceUsd,
    config?.liveCapitalUsdc ?? 100_000,
    config,
  );
  const state = new PipelineStateManager();

  return {
    symbol,
    timeframe,
    initialBalanceUsd,
    ledgerPath,
    runCardDir,
    strictLedgerVerification,
    subsystems,
    state,
  };
}
