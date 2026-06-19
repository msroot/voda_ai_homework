import { getTenantId } from "../context/authContext.js";
import { query, queryWithoutTenantContext } from "../db.js";
import type { User, UserRole } from "../types.js";

const userColumns = "id, tenant_id, name, email, role, created_at";

export interface UserWithPassword extends User {
  password_hash: string;
}

export async function findUsers(
  limit: number,
  offset: number
): Promise<{ rows: User[]; total: number }> {
  const totalResult = await query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM users"
  );
  const total = totalResult.rows[0]?.count ?? 0;

  const { rows } = await query<User>(
    `SELECT ${userColumns} FROM users ORDER BY created_at LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return { rows, total };
}

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await query<User>(
    `SELECT ${userColumns} FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserWithPassword | null> {
  const { rows } = await queryWithoutTenantContext<UserWithPassword>(
    "SELECT id, tenant_id, name, email, password_hash, role, created_at FROM users WHERE email = $1",
    [email]
  );
  return rows[0] ?? null;
}

export async function createUser(
  id: string,
  name: string,
  email: string,
  passwordHash: string,
  role: UserRole
): Promise<User> {
  return createUserForTenant(id, getTenantId(), name, email, passwordHash, role);
}

// Used by tenant onboarding, which runs without a tenant context and inserts the
// first user into a brand-new tenant, so it bypasses RLS with an explicit tenant.
export async function createUserForTenant(
  id: string,
  tenantId: string,
  name: string,
  email: string,
  passwordHash: string,
  role: UserRole
): Promise<User> {
  const { rows } = await queryWithoutTenantContext<User>(
    `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${userColumns}`,
    [id, tenantId, name, email, passwordHash, role]
  );
  return rows[0];
}

export async function updateUser(
  id: string,
  name: string | null,
  email: string | null,
  passwordHash: string | null,
  role: UserRole | null
): Promise<User | null> {
  const { rows } = await query<User>(
    `UPDATE users
     SET name = COALESCE($2, name),
         email = COALESCE($3, email),
         password_hash = COALESCE($4, password_hash),
         role = COALESCE($5, role)
     WHERE id = $1
     RETURNING ${userColumns}`,
    [id, name, email, passwordHash, role]
  );
  return rows[0] ?? null;
}

export async function deleteUser(id: string): Promise<boolean> {
  const { rowCount } = await query("DELETE FROM users WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
