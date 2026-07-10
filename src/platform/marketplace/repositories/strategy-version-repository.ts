import { query } from '../../../shared/db/postgres-client';

export interface StrategyVersionRow {
 id: string;
 strategy_id: string;
 tenant_id: string;
 version: string;
 semver_major: number;
 semver_minor: number;
 semver_patch: number;
 entry_rules: Record<string, unknown>;
 exit_rules: Record<string, unknown>;
 risk_params: Record<string, unknown>;
 status: string;
 backtest_run_id: string | null;
 published_at: string | null;
 created_at: string;
}

export class StrategyVersionRepository {
 async findById(id: string): Promise<StrategyVersionRow | null> {
 const result = await query('SELECT * FROM strategy_versions WHERE id=$1', [id]);
 return (result.rows[0] as unknown as StrategyVersionRow) ?? null;
 }

 async findByStrategy(strategyId: string): Promise<StrategyVersionRow[]> {
 const result = await query(
 'SELECT * FROM strategy_versions WHERE strategy_id=$1 ORDER BY semver_major DESC, semver_minor DESC, semver_patch DESC',
 [strategyId],
 );
 return result.rows as unknown as StrategyVersionRow[];
 }

 async findLatestByStrategy(strategyId: string): Promise<StrategyVersionRow | null> {
 const result = await query(
 `SELECT * FROM strategy_versions
 WHERE strategy_id=$1
 ORDER BY semver_major DESC, semver_minor DESC, semver_patch DESC
 LIMIT 1`,
 [strategyId],
 );
 return (result.rows[0] as unknown as StrategyVersionRow) ?? null;
 }

 async findPublishedByStrategy(strategyId: string): Promise<StrategyVersionRow | null> {
 const result = await query(
 `SELECT * FROM strategy_versions WHERE strategy_id=$1 AND status='published'
 ORDER BY semver_major DESC, semver_minor DESC, semver_patch DESC LIMIT 1`,
 [strategyId],
 );
 return (result.rows[0] as unknown as StrategyVersionRow) ?? null;
 }

 /**
 * Insert a new version — enforces UNIQUE(strategy_id, major, minor, patch) at DB level.
 * Throws on duplicate version number.
 */
 async create(data: {
 id: string;
 strategyId: string;
 tenantId: string;
 version: string;
 semverMajor: number;
 semverMinor: number;
 semverPatch: number;
 entryRules: Record<string, unknown>;
 exitRules: Record<string, unknown>;
 riskParams: Record<string, unknown>;
 backtestRunId?: string | null;
 status?: string;
 }): Promise<StrategyVersionRow> {
 const result = await query(
 `INSERT INTO strategy_versions
 (id, strategy_id, tenant_id, version, semver_major, semver_minor, semver_patch,
 entry_rules, exit_rules, risk_params, status, backtest_run_id)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,NULL))
 RETURNING *`,
 [
 data.id,
 data.strategyId,
 data.tenantId,
 data.version,
 data.semverMajor,
 data.semverMinor,
 data.semverPatch,
 data.entryRules,
 data.exitRules,
 data.riskParams,
 data.status ?? 'draft',
 data.backtestRunId ?? null,
 ],
 );
 return result.rows[0] as unknown as StrategyVersionRow;
 }

 async publish(id: string): Promise<StrategyVersionRow | null> {
 const result = await query(
 `UPDATE strategy_versions SET status='published', published_at=NOW() WHERE id=$1 RETURNING *`,
 [id],
 );
 return (result.rows[0] as unknown as StrategyVersionRow) ?? null;
 }

 /**
 * Count distinct (strategy_id, version) tuples per tenant — utility for dashboard.
 */
 async countByTenant(tenantId: string): Promise<number> {
 const result = await query(
 'SELECT COUNT(*) AS cnt FROM strategy_versions WHERE tenant_id=$1',
 [tenantId],
 );
 return parseInt(String(result.rows[0]?.cnt ?? '0'), 10);
 }
}

export const strategyVersionRepository = new StrategyVersionRepository();
