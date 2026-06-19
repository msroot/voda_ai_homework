import type {
  CreateAssetInput,
  CreateTenantInput,
  CreateUserInput,
  LoginInput,
  UpdateAssetInput,
  UpdateTenantInput,
  UpdateUserInput,
  UserRole,
} from "./schemas.js";

export type {
  CreateAssetInput,
  CreateTenantInput,
  CreateUserInput,
  LoginInput,
  UpdateAssetInput,
  UpdateTenantInput,
  UpdateUserInput,
  UserRole,
};

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

export interface Asset {
  id: string;
  tenant_id: string;
  status: string;
  data: Record<string, unknown>;
  created_by: string;
  created_at: Date;
}
