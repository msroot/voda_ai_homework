import { getTenantId } from "../context/authContext.js";
import { query, withBypassTransaction } from "../db.js";
import type { Tenant, User, UserRole } from "../types.js";

const tenantColumns = "id, name, slug, created_at";

interface AssetSchemaVersion {
  version: number;
  schema: Record<string, unknown>;
}

export async function findTenantById(id: string): Promise<Tenant | null> {
  const { rows } = await query<Tenant>(
    `SELECT ${tenantColumns} FROM tenants WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// The tenant's immutable asset schema (version 1).
export async function findLatestAssetSchema(): Promise<AssetSchemaVersion | null> {
  const { rows } = await query<AssetSchemaVersion>(
    `SELECT version, schema FROM asset_schemas
      WHERE tenant_id = $1`,
    [getTenantId()]
  );
  return rows[0] ?? null;
}

// A specific historical schema version. Used to re-validate edits to an existing
// asset against the version it was created with.
export async function findAssetSchemaByVersion(
  version: number
): Promise<Record<string, unknown> | null> {
  const { rows } = await query<{ schema: Record<string, unknown> }>(
    `SELECT schema FROM asset_schemas WHERE tenant_id = $1 AND version = $2`,
    [getTenantId(), version]
  );
  return rows[0]?.schema ?? null;
}

// Onboarding: insert the tenant and its first admin user in one transaction so
// a failure on either leaves no orphaned tenant. Bypasses RLS because there is
// no tenant context yet.
export async function createTenantWithAdmin(params: {
  tenantId: string;
  name: string;
  slug: string;
  assetSchema: Record<string, unknown>;
  userId: string;
  userName: string;
  userEmail: string;
  passwordHash: string;
  role: UserRole;
}): Promise<{ tenant: Tenant; user: User }> {
  return withBypassTransaction(async (client) => {
    const tenantResult = await client.query<Tenant>(
      `INSERT INTO tenants (id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING ${tenantColumns}`,
      [params.tenantId, params.name, params.slug]
    );

    // Version 1: default AJV schema so the tenant can create assets immediately.
    await client.query(
      `INSERT INTO asset_schemas (tenant_id, version, schema)
       VALUES ($1, 1, $2)`,
      [params.tenantId, JSON.stringify(params.assetSchema)]
    );

    const userResult = await client.query<User>(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tenant_id, name, email, role, created_at`,
      [
        params.userId,
        params.tenantId,
        params.userName,
        params.userEmail,
        params.passwordHash,
        params.role,
      ]
    );

    return { tenant: tenantResult.rows[0], user: userResult.rows[0] };
  });
}

// Updates tenant metadata only. The asset schema is immutable after creation.
export async function updateTenant(
  id: string,
  name: string | null,
  slug: string | null
): Promise<Tenant | null> {
  const { rows } = await query<Tenant>(
    `UPDATE tenants
     SET name = COALESCE($2, name),
         slug = COALESCE($3, slug)
     WHERE id = $1
     RETURNING ${tenantColumns}`,
    [id, name, slug]
  );
  return rows[0] ?? null;
}
