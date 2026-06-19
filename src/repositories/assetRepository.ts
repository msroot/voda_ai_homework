import pool from "../db.js";
import type { Asset } from "../types.js";

const assetColumns = "id, tenant_id, status, data, created_by, created_at";

export async function findAssetsByTenantId(tenantId: string): Promise<Asset[]> {
  const { rows } = await pool.query<Asset>(
    `SELECT ${assetColumns} FROM assets WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

export async function findAssetByIdAndTenantId(
  id: string,
  tenantId: string
): Promise<Asset | null> {
  const { rows } = await pool.query<Asset>(
    `SELECT ${assetColumns} FROM assets WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rows[0] ?? null;
}

export async function createAsset(
  id: string,
  tenantId: string,
  status: string,
  data: Record<string, unknown>,
  createdBy: string
): Promise<Asset> {
  const { rows } = await pool.query<Asset>(
    `INSERT INTO assets (id, tenant_id, status, data, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${assetColumns}`,
    [id, tenantId, status, JSON.stringify(data), createdBy]
  );
  return rows[0];
}

export async function updateAsset(
  id: string,
  tenantId: string,
  data: string | null,
  status: string | null
): Promise<Asset | null> {
  const { rows } = await pool.query<Asset>(
    `UPDATE assets
     SET data = COALESCE($2, data),
         status = COALESCE($3, status)
     WHERE id = $1 AND tenant_id = $4
     RETURNING ${assetColumns}`,
    [id, data, status, tenantId]
  );
  return rows[0] ?? null;
}

export async function deleteAsset(id: string, tenantId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM assets WHERE id = $1 AND tenant_id = $2",
    [id, tenantId]
  );
  return (rowCount ?? 0) > 0;
}
