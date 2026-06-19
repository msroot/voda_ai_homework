export type UserRole = "admin" | "editor" | "viewer";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  asset_schema: Record<string, unknown>;
  created_at: Date;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
}

export interface UpdateTenantInput {
  name?: string;
  slug?: string;
  /** Additional JSON Schema fields merged into the tenant schema. Base fields are never removed. */
  asset_schema?: Record<string, unknown>;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
}

export interface Asset {
  id: string;
  tenant_id: string;
  status: string;
  data: Record<string, unknown>;
  created_by: string;
  created_at: Date;
}

export interface CreateAssetInput {
  data: Record<string, unknown>;
}

export interface UpdateAssetInput {
  data?: Record<string, unknown>;
  status?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
