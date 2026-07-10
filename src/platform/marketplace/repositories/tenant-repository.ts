import { query } from '../../../shared/db/postgres-client';

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export class TenantRepository {
  async findById(id: string): Promise<TenantRow | null> {
    const result = await query('SELECT * FROM tenants WHERE id = $1', [id]);
    return (result.rows[0] as unknown as TenantRow) ?? null;
  }

  async findBySlug(slug: string): Promise<TenantRow | null> {
    const result = await query('SELECT * FROM tenants WHERE slug = $1', [slug]);
    return (result.rows[0] as unknown as TenantRow) ?? null;
  }

  async upsert(data: {
    id: string;
    name: string;
    slug: string;
    plan?: string;
    status?: string;
    settings?: Record<string, unknown>;
  }): Promise<TenantRow> {
    const result = await query(
      `INSERT INTO tenants (id, name, slug, plan, status, settings, metadata)
       VALUES ($1,$2,$3,COALESCE($4,'free'),COALESCE($5,'active'),COALESCE($6,'{}'::jsonb),'{}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug, plan=EXCLUDED.plan, status=EXCLUDED.status, settings=EXCLUDED.settings, updated_at=NOW()
       RETURNING *`,
      [data.id, data.name, data.slug, data.plan ?? 'free', data.status ?? 'active', data.settings ?? {}],
    );
    return result.rows[0] as unknown as TenantRow;
  }

  async update(id: string, data: {
    name?: string;
    slug?: string;
    plan?: string;
    status?: string;
    settings?: Record<string, unknown>;
  }): Promise<TenantRow | null> {
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${idx++}`);
      params.push(value);
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    const result = await query(`UPDATE tenants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    return (result.rows[0] as unknown as TenantRow) ?? null;
  }

  async exists(slug: string): Promise<boolean> {
    const result = await query('SELECT 1 FROM tenants WHERE slug = $1 LIMIT 1', [slug]);
    return result.rows.length > 0;
  }
}

export const tenantRepository = new TenantRepository();
