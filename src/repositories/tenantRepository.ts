import { query, withBypassTransaction } from "../db.js";
import type { Tenant, User, UserRole } from "../types.js";

const tenantColumns = "id, name, slug, asset_schema, created_at";

export async function findAllTenants(): Promise<Tenant[]> {
  const { rows } = await query<Tenant>(
    `SELECT ${tenantColumns} FROM tenants ORDER BY created_at`
  );
  return rows;
}

export async function findTenantById(id: string): Promise<Tenant | null> {
  const { rows } = await query<Tenant>(
    `SELECT ${tenantColumns} FROM tenants WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findTenantAssetSchema(): Promise<Record<string, unknown> | null> {
  const { rows } = await query<{ asset_schema: Record<string, unknown> }>(
    "SELECT asset_schema FROM tenants"
  );
  return rows[0]?.asset_schema ?? null;
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
      `INSERT INTO tenants (id, name, slug, asset_schema)
       VALUES ($1, $2, $3, $4)
       RETURNING ${tenantColumns}`,
      [params.tenantId, params.name, params.slug, JSON.stringify(params.assetSchema)]
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

export async function updateTenant(
  id: string,
  name: string | null,
  slug: string | null,
  assetSchema: string | null
): Promise<Tenant | null> {
  const { rows } = await query<Tenant>(
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
  const { rowCount } = await query("DELETE FROM tenants WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
