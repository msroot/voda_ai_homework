import { getTenantId, getUserId } from "../lib/authContext.js";
import { query, queryWithoutTenantContext, withBypassTransaction } from "../clients/postgres.js";
import type { Asset } from "../types.js";

interface PendingAsset {
  id: string;
  tenant_id: string;
  modified_by: string;
}

const assetColumns =
  "id, tenant_id, status, action, schema_version, data, created_by, modified_by, synced_at, created_at";

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
  schemaVersion: number,
  data: Record<string, unknown>,
  createdBy: string
): Promise<Asset> {
  const tenantId = getTenantId();
  const { rows } = await query<Asset>(
    `INSERT INTO assets (id, tenant_id, status, action, schema_version, data, created_by, modified_by)
     VALUES ($1, $2, $3, 'upsert', $4, $5, $6, $6)
     RETURNING ${assetColumns}`,
    [id, tenantId, status, schemaVersion, JSON.stringify(data), createdBy]
  );
  return rows[0];
}

export async function updateAsset(
  id: string,
  data: string,
  modifiedBy: string
): Promise<Asset | null> {
  const { rows } = await query<Asset>(
    `UPDATE assets
     SET data = $2,
         status = 'pending',
         action = 'upsert',
         modified_by = $3,
         synced_at = NULL,
         claimed_at = NULL
     WHERE id = $1
     RETURNING ${assetColumns}`,
    [id, data, modifiedBy]
  );
  return rows[0] ?? null;
}

export async function markAssetForDeletion(id: string, modifiedBy: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE assets
        SET status = 'pending',
            action = 'delete',
            modified_by = $2,
            synced_at = NULL,
            claimed_at = NULL
      WHERE id = $1`,
    [id, modifiedBy]
  );
  return (rowCount ?? 0) > 0;
}

export async function hardDeleteAsset(id: string): Promise<void> {
  await query("DELETE FROM assets WHERE id = $1", [id]);
}

export async function markAssetSynced(id: string): Promise<void> {
  await query(
    `UPDATE assets
        SET status = 'synced',
            synced_at = NOW(),
            claimed_at = NULL
      WHERE id = $1
        AND action = 'upsert'
        AND status = 'processing'`,
    [id]
  );
}

export async function markAssetFailed(id: string): Promise<void> {
  await query(
    `UPDATE assets
        SET status = 'failed',
            claimed_at = NULL
      WHERE id = $1
        AND status = 'processing'`,
    [id]
  );
}

export async function releasePendingClaim(id: string): Promise<void> {
  await queryWithoutTenantContext(
    `UPDATE assets
        SET status = 'pending',
            claimed_at = NULL
      WHERE id = $1
        AND status = 'processing'`,
    [id]
  );
}

export async function claimPendingAssets(limit: number): Promise<PendingAsset[]> {
  return withBypassTransaction(async (client) => {
    const { rows } = await client.query<PendingAsset>(
      `SELECT id, tenant_id, modified_by
         FROM assets
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit]
    );

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    await client.query(
      `UPDATE assets
          SET status = 'processing',
              claimed_at = NOW()
        WHERE id = ANY($1::uuid[])`,
      [ids]
    );

    return rows;
  });
}

export async function recoverStuckProcessing(staleSeconds: number): Promise<number> {
  const { rowCount } = await queryWithoutTenantContext(
    `UPDATE assets
        SET status = 'pending',
            claimed_at = NULL
      WHERE status = 'processing'
        AND claimed_at < NOW() - ($1::int * interval '1 second')`,
    [staleSeconds]
  );
  return rowCount ?? 0;
}
