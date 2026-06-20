import type { UserRole } from "./schemas.js";

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

export type AssetAction = "upsert" | "delete";

export interface Asset {
  id: string;
  tenant_id: string;
  status: string;
  action: AssetAction;
  schema_version: number;
  data: Record<string, unknown>;
  created_by: string;
  created_at: Date;
}

export interface Paginated<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
