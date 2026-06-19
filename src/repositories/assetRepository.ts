import { getTenantId } from "../context/authContext.js";
import { query } from "../db.js";
import type { Asset } from "../types.js";

const assetColumns = "id, tenant_id, status, data, created_by, created_at";

export async function findAllAssets(): Promise<Asset[]> {
  const { rows } = await query<Asset>(
    `SELECT ${assetColumns} FROM assets ORDER BY created_at DESC`
  );
  return rows;
}

export async function findAssetById(id: string): Promise<Asset | null> {
  const { rows } = await query<Asset>(
    `SELECT ${assetColumns} FROM assets WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createAsset(
  id: string,
  status: string,
  data: Record<string, unknown>,
  createdBy: string
): Promise<Asset> {
  const tenantId = getTenantId();
  const { rows } = await query<Asset>(
    `INSERT INTO assets (id, tenant_id, status, data, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${assetColumns}`,
    [id, tenantId, status, JSON.stringify(data), createdBy]
  );
  return rows[0];
}

export async function updateAsset(
  id: string,
  data: string | null,
  status: string | null
): Promise<Asset | null> {
  const { rows } = await query<Asset>(
    `UPDATE assets
     SET data = COALESCE($2, data),
         status = COALESCE($3, status)
     WHERE id = $1
     RETURNING ${assetColumns}`,
    [id, data, status]
  );
  return rows[0] ?? null;
}

export async function deleteAsset(id: string): Promise<boolean> {
  const { rowCount } = await query("DELETE FROM assets WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
