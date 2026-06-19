export type UserRole = "admin" | "editor" | "viewer";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
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
}

export interface CreateUserInput {
  tenant_id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
}
