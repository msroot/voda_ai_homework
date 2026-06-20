import { getTenantId } from "../context/authContext.js";
import { query, queryWithoutTenantContext } from "../db.js";
import type { Asset } from "../types.js";

interface PendingAsset {
  id: string;
  tenant_id: string;
  created_by: string;
}

const assetColumns =
  "id, tenant_id, status, action, schema_version, data, created_by, created_at";

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
    `INSERT INTO assets (id, tenant_id, status, action, schema_version, data, created_by)
     VALUES ($1, $2, $3, 'upsert', $4, $5, $6)
     RETURNING ${assetColumns}`,
    [id, tenantId, status, schemaVersion, JSON.stringify(data), createdBy]
  );
  return rows[0];
}

export async function updateAsset(
  id: string,
  data: string
): Promise<Asset | null> {
  const { rows } = await query<Asset>(
    `UPDATE assets
     SET data = $2,
         status = 'pending',
         action = 'upsert'
     WHERE id = $1
     RETURNING ${assetColumns}`,
    [id, data]
  );
  return rows[0] ?? null;
}

// Soft delete: turn the row into a delete tombstone the worker will process
// (remove the Mongo doc, then hard-delete this row). Tenant-scoped via RLS, so
// it returns false for assets that belong to another tenant.
export async function markAssetForDeletion(id: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE assets
        SET status = 'pending', action = 'delete'
      WHERE id = $1`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

// Final removal once the read model has been cleared. Used by the sync worker
// after it deletes the Mongo document.
export async function hardDeleteAsset(id: string): Promise<void> {
  await query("DELETE FROM assets WHERE id = $1", [id]);
}

// Marks an upsert as synced. Guarded on action = 'upsert' so a delete tombstone
// that arrived mid-sync isn't lost (the row stays 'pending' and gets re-polled).
export async function markAssetSynced(id: string): Promise<void> {
  await query(
    "UPDATE assets SET status = 'synced' WHERE id = $1 AND action = 'upsert'",
    [id]
  );
}

// Outbox poll: reads pending rows across all tenants (a trusted system process),
// so it bypasses RLS. The actual sync/update runs per-tenant in the worker.
//
// FOR UPDATE SKIP LOCKED locks each row the moment it is read and tells any
// other concurrent poller to skip past locked rows to the next available ones.
// This lets the outbox listener scale horizontally without two pollers grabbing
// the same batch (the row locks live for this statement's transaction). Durable
// de-duplication across poll ticks is handled separately by the queue, which
// keys jobs on assetId so an in-flight asset is never enqueued twice.
export async function findPendingAssets(limit: number): Promise<PendingAsset[]> {
  const { rows } = await queryWithoutTenantContext<PendingAsset>(
    `SELECT id, tenant_id, created_by
       FROM assets
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  return rows;
}
