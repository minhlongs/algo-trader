import { query } from '../../../shared/db/postgres-client';

export interface ProviderRow {
 id: string;
 tenant_id: string;
 user_id: string;
 display_name: string;
 bio: string | null;
 payout_address: string | null;
 verified_at: string | null;
 status: string;
 metadata: Record<string, unknown>;
 created_at: string;
 updated_at: string;
}

export class ProviderRepository {
 async findById(id: string): Promise<ProviderRow | null> {
 const result = await query('SELECT * FROM providers WHERE id = $1', [id]);
 return (result.rows[0] as unknown as ProviderRow) ?? null;
 }

 async findByUserId(userId: string): Promise<ProviderRow | null> {
 const result = await query('SELECT * FROM providers WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
 return (result.rows[0] as unknown as ProviderRow) ?? null;
 }

 async findByTenant(tenantId: string): Promise<ProviderRow | null> {
 const result = await query('SELECT * FROM providers WHERE tenant_id = $1 LIMIT 1', [tenantId]);
 return (result.rows[0] as unknown as ProviderRow) ?? null;
 }

 async list(status?: string, limit = 50, offset = 0): Promise<ProviderRow[]> {
 const sql = status
 ? 'SELECT * FROM providers WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3'
 : 'SELECT * FROM providers ORDER BY created_at DESC LIMIT $1 OFFSET $2';
 const params = status ? [status, limit, offset] : [limit, offset];
 const result = await query(sql, params);
 return result.rows as unknown as ProviderRow[];
 }

 async create(data: {
 id: string;
 tenantId: string;
 userId: string;
 displayName: string;
 bio?: string;
 payoutAddress?: string;
 status?: string;
 }): Promise<ProviderRow> {
 const result = await query(
 `INSERT INTO providers (id, tenant_id, user_id, display_name, bio, payout_address, status)
 VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'pending'))
 RETURNING *`,
 [data.id, data.tenantId, data.userId, data.displayName, data.bio ?? null, data.payoutAddress ?? null, data.status ?? 'pending'],
 );
 return result.rows[0] as unknown as ProviderRow;
 }

 async updateStatus(id: string, status: string, verifiedAt?: string | null): Promise<ProviderRow | null> {
 const result = await query(
 `UPDATE providers SET status=$1, verified_at=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
 [status, verifiedAt ?? new Date().toISOString(), id],
 );
 return (result.rows[0] as unknown as ProviderRow) ?? null;
 }

 async update(id: string, data: {
 displayName?: string;
 bio?: string | null;
 payoutAddress?: string | null;
 }): Promise<ProviderRow | null> {
 const fields: string[] = [];
 const params: unknown[] = [];
 let idx = 1;
 if (data.displayName !== undefined) { fields.push(`display_name=$${idx++}`); params.push(data.displayName); }
 if (data.bio !== undefined) { fields.push(`bio=$${idx++}`); params.push(data.bio); }
 if (data.payoutAddress !== undefined) { fields.push(`payout_address=$${idx++}`); params.push(data.payoutAddress); }
 if (fields.length === 0) return this.findById(id);
 fields.push(`updated_at=NOW()`);
 params.push(id);
 const result = await query(`UPDATE providers SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`, params);
 return (result.rows[0] as unknown as ProviderRow) ?? null;
 }
}

export const providerRepository = new ProviderRepository();
