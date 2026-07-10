import { query } from '../../../shared/db/postgres-client';

export interface MarketplaceBacktestRow {
  id: string;
  strategy_id: string;
  tenant_id: string;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  total_pnl_usd: number;
  profit_factor: number | null;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  avg_win_usd: number | null;
  avg_loss_usd: number | null;
  volatility: number | null;
  equity_curve: number[] | null;
  total_return: number | null;
  initial_capital_usd: number;
  config: Record<string, unknown> | null;
  created_at: string;
}

export interface BacktestCreateInput {
  id: string;
  strategyId: string;
  tenantId: string;
  sharpeRatio?: number | null;
  maxDrawdown?: number | null;
  winRate?: number | null;
  totalPnlUsd?: number;
  profitFactor?: number | null;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  avgWinUsd?: number | null;
  avgLossUsd?: number | null;
  volatility?: number | null;
  equityCurve?: number[] | null;
  totalReturn?: number | null;
  initialCapitalUsd?: number;
  config?: Record<string, unknown> | null;
}

export class BacktestRepository {
  async findById(id: string): Promise<MarketplaceBacktestRow | null> {
    const result = await query('SELECT * FROM marketplace_backtests WHERE id=$1', [id]);
    return result.rows[0] as unknown as MarketplaceBacktestRow ?? null;
  }

  async findByStrategy(strategyId: string): Promise<MarketplaceBacktestRow[]> {
    const result = await query(
      'SELECT * FROM marketplace_backtests WHERE strategy_id=$1 ORDER BY created_at DESC',
      [strategyId],
    );
    return result.rows as unknown as MarketplaceBacktestRow[];
  }

  async findLatestByStrategy(
    strategyId: string,
  ): Promise<MarketplaceBacktestRow | null> {
    const result = await query(
      'SELECT * FROM marketplace_backtests WHERE strategy_id=$1 ORDER BY created_at DESC LIMIT 1',
      [strategyId],
    );
    return result.rows[0] as unknown as MarketplaceBacktestRow ?? null;
  }

  async findByTenant(tenantId: string): Promise<MarketplaceBacktestRow[]> {
    const result = await query(
      'SELECT * FROM marketplace_backtests WHERE tenant_id=$1 ORDER BY created_at DESC',
      [tenantId],
    );
    return result.rows as unknown as MarketplaceBacktestRow[];
  }

  async create(data: BacktestCreateInput): Promise<MarketplaceBacktestRow> {
    const result = await query(
      `INSERT INTO marketplace_backtests
       (id, strategy_id, tenant_id, sharpe_ratio, max_drawdown, win_rate, total_pnl_usd,
        profit_factor, total_trades, winning_trades, losing_trades, avg_win_usd, avg_loss_usd,
        volatility, equity_curve, total_return, initial_capital_usd, config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,COALESCE($18,'{}'::jsonb))
       RETURNING *`,
      [
        data.id,
        data.strategyId,
        data.tenantId,
        data.sharpeRatio ?? null,
        data.maxDrawdown ?? null,
        data.winRate ?? null,
        data.totalPnlUsd ?? 0,
        data.profitFactor ?? null,
        data.totalTrades ?? 0,
        data.winningTrades ?? 0,
        data.losingTrades ?? 0,
        data.avgWinUsd ?? null,
        data.avgLossUsd ?? null,
        data.volatility ?? null,
        data.equityCurve ?? null,
        data.totalReturn ?? null,
        data.initialCapitalUsd ?? 10000,
        data.config ?? null,
      ],
    );
    return result.rows[0] as unknown as MarketplaceBacktestRow;
  }

  async countByTenant(tenantId: string): Promise<number> {
    const result = await query(
      'SELECT COUNT(*) AS cnt FROM marketplace_backtests WHERE tenant_id=$1',
      [tenantId],
    );
    return parseInt(String(result.rows[0]?.cnt ?? '0'), 10);
  }

  async count(filters?: { strategyId?: string; tenantId?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (filters?.strategyId) {
      conditions.push(`strategy_id=$${idx++}`);
      params.push(filters.strategyId);
    }
    if (filters?.tenantId) {
      conditions.push(`tenant_id=$${idx++}`);
      params.push(filters.tenantId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT COUNT(*) AS cnt FROM marketplace_backtests ${where}`,
      params,
    );
    return parseInt(String(result.rows[0]?.cnt ?? '0'), 10);
  }

  async findAll(filters?: {
    strategyId?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MarketplaceBacktestRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (filters?.strategyId) {
      conditions.push(`strategy_id=$${idx++}`);
      params.push(filters.strategyId);
    }
    if (filters?.tenantId) {
      conditions.push(`tenant_id=$${idx++}`);
      params.push(filters.tenantId);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;
    const result = await query(
      `SELECT * FROM marketplace_backtests ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );
    return result.rows as unknown as MarketplaceBacktestRow[];
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM marketplace_backtests WHERE id=$1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const backtestRepository = new BacktestRepository();
