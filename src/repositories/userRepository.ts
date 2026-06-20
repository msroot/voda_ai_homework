import { getTenantId } from "../context/authContext.js";
import { query, queryWithoutTenantContext } from "../db.js";
import type { User, UserRole } from "../types.js";

const userColumns = "id, tenant_id, name, email, role, created_at";

interface UserWithPassword extends User {
  password_hash: string;
}

export async function findUsers(
  limit: number,
  offset: number
): Promise<{ rows: User[]; total: number }> {
  const totalResult = await query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NULL"
  );
  const total = totalResult.rows[0]?.count ?? 0;

  const { rows } = await query<User>(
    `SELECT ${userColumns} FROM users
      WHERE deleted_at IS NULL
      ORDER BY created_at LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return { rows, total };
}

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await query<User>(
    `SELECT ${userColumns} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserWithPassword | null> {
  const { rows } = await queryWithoutTenantContext<UserWithPassword>(
    `SELECT id, tenant_id, name, email, password_hash, role, created_at
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  return rows[0] ?? null;
}

// Authenticated user creation. RLS enforces tenant_id = current tenant via the
// WITH CHECK policy; tenant_id is passed explicitly only because the column is
// NOT NULL. (Onboarding's first user is inserted separately, inside the tenant
// creation transaction, since there is no tenant context yet.)
export async function createUser(
  id: string,
  name: string,
  email: string,
  passwordHash: string,
  role: UserRole
): Promise<User> {
  const { rows } = await query<User>(
    `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${userColumns}`,
    [id, getTenantId(), name, email, passwordHash, role]
  );
  return rows[0];
}

// email is immutable after creation, so it is intentionally not updatable.
export async function updateUser(
  id: string,
  name: string | null,
  passwordHash: string | null,
  role: UserRole | null
): Promise<User | null> {
  const { rows } = await query<User>(
    `UPDATE users
     SET name = COALESCE($2, name),
         password_hash = COALESCE($3, password_hash),
         role = COALESCE($4, role)
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${userColumns}`,
    [id, name, passwordHash, role]
  );
  return rows[0] ?? null;
}

// Soft delete: keep the row (so references like assets.created_by stay valid)
// and mark it deleted. Reads, login and updates all filter on deleted_at IS NULL.
export async function deleteUser(id: string): Promise<boolean> {
  const { rowCount } = await query(
    "UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  return (rowCount ?? 0) > 0;
}
