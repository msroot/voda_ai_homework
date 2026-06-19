import pool from "../db.js";
import type { Tenant } from "../types.js";

const tenantColumns = "id, name, slug, asset_schema, created_at";

export async function findAllTenants(): Promise<Tenant[]> {
  const { rows } = await pool.query<Tenant>(
    `SELECT ${tenantColumns} FROM tenants ORDER BY created_at`
  );
  return rows;
}

export async function findTenantById(id: string): Promise<Tenant | null> {
  const { rows } = await pool.query<Tenant>(
    `SELECT ${tenantColumns} FROM tenants WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findTenantAssetSchema(
  id: string
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query<{ asset_schema: Record<string, unknown> }>(
    "SELECT asset_schema FROM tenants WHERE id = $1",
    [id]
  );
  return rows[0]?.asset_schema ?? null;
}

export async function createTenant(
  id: string,
  name: string,
  slug: string,
  assetSchema: Record<string, unknown>
): Promise<Tenant> {
  const { rows } = await pool.query<Tenant>(
    `INSERT INTO tenants (id, name, slug, asset_schema) VALUES ($1, $2, $3, $4) RETURNING ${tenantColumns}`,
    [id, name, slug, JSON.stringify(assetSchema)]
  );
  return rows[0];
}

export async function updateTenant(
  id: string,
  name: string | null,
  slug: string | null,
  assetSchema: string | null
): Promise<Tenant | null> {
  const { rows } = await pool.query<Tenant>(
    `UPDATE tenants
     SET name = COALESCE($2, name),
         slug = COALESCE($3, slug),
         asset_schema = COALESCE($4, asset_schema)
     WHERE id = $1
     RETURNING ${tenantColumns}`,
    [id, name, slug, assetSchema]
  );
  return rows[0] ?? null;
}

export async function deleteTenant(id: string): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM tenants WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
