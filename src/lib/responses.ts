import type { Asset, Tenant, User } from "../types.js";

/** Public label for an asset schema version (API + reports). DB/Mongo store the integer. */
export function formatSchemaVersion(version: number): string {
  return `v_${version}`;
}

export function parseSchemaVersion(label: string): number {
  const match = /^v_(\d+)$/.exec(label);
  if (!match) {
    throw new Error(`Invalid schema version label: ${label}`);
  }
  return Number(match[1]);
}

export interface AssetResponse {
  id: string;
  tenant_id: string;
  schema_version: string;
  name: string;
  type: string;
  status: string;
  lat: number | null;
  lng: number | null;
  installed_at: string | null;
  extra_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
  synced_by: string | null;
}

export interface MongoAssetRecord {
  tenant_id: string;
  schema_version: number;
  name: string;
  type: string;
  status: string | null;
  lat: number | null;
  lng: number | null;
  installed_at: string | null;
  extra_fields: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  synced_at: Date;
  synced_by: string;
}

export interface UserResponse {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: User["role"];
  created_at: string;
}

export interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  schema_version: string;
  asset_schema: Record<string, unknown>;
  created_at: string;
}

export interface LoginResponse {
  token: string;
  user: UserResponse;
}

export interface TenantOverviewReport {
  tenant: Pick<TenantResponse, "id" | "name" | "slug">;
  users: {
    total: number;
    by_role: Record<string, number>;
  };
  asset_schema: {
    versions_count: number;
    versions: string[];
    current_version: string;
  };
  assets: {
    total: number;
    by_status: Record<string, number>;
    by_schema_version: Record<string, number>;
  };
  generated_at: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Shared field extraction for Postgres asset.data and Mongo documents. */
export function extractAssetDataFields(data: Record<string, unknown>): {
  name: string;
  type: string;
  status: string | null;
  lat: number | null;
  lng: number | null;
  installed_at: string | null;
  extra_fields: Record<string, unknown>;
} {
  return {
    name: typeof data.name === "string" ? data.name : "",
    type: typeof data.type === "string" ? data.type : "",
    status: typeof data.status === "string" ? data.status : null,
    lat: typeof data.lat === "number" ? data.lat : null,
    lng: typeof data.lng === "number" ? data.lng : null,
    installed_at: typeof data.installed_at === "string" ? data.installed_at : null,
    extra_fields: asRecord(data.extra_fields),
  };
}

interface AssetResponseInput {
  id: string;
  tenant_id: string;
  schema_version: number;
  name: string;
  type: string;
  status: string | null;
  lat: number | null;
  lng: number | null;
  installed_at: string | null;
  extra_fields: Record<string, unknown>;
  created_at: Date;
  updated_at: Date | null;
  synced_at: Date | null;
  synced_by: string | null;
}

function toAssetResponse(input: AssetResponseInput): AssetResponse {
  return {
    id: input.id,
    tenant_id: input.tenant_id,
    schema_version: formatSchemaVersion(input.schema_version),
    name: input.name,
    type: input.type,
    status: input.status ?? "",
    lat: input.lat,
    lng: input.lng,
    installed_at: input.installed_at,
    extra_fields: input.extra_fields,
    created_at: input.created_at.toISOString(),
    updated_at: input.updated_at?.toISOString() ?? null,
    synced_at: input.synced_at?.toISOString() ?? null,
    synced_by: input.synced_by,
  };
}

export function tenantToResponse(
  tenant: Tenant,
  schemaVersion: number,
  assetSchema: Record<string, unknown>
): TenantResponse {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    schema_version: formatSchemaVersion(schemaVersion),
    asset_schema: assetSchema,
    created_at: tenant.created_at.toISOString(),
  };
}

export function assetRecordToResponse(
  id: string,
  record: MongoAssetRecord
): AssetResponse {
  return toAssetResponse({
    id,
    tenant_id: record.tenant_id,
    schema_version: record.schema_version,
    name: record.name,
    type: record.type,
    status: record.status,
    lat: record.lat,
    lng: record.lng,
    installed_at: record.installed_at,
    extra_fields: record.extra_fields,
    created_at: record.created_at,
    updated_at: record.updated_at,
    synced_at: record.synced_at,
    synced_by: record.synced_by,
  });
}

export function postgresAssetToResponse(asset: Asset): AssetResponse {
  const fields = extractAssetDataFields(asset.data as Record<string, unknown>);
  const syncedAt = asset.synced_at;

  return toAssetResponse({
    id: asset.id,
    tenant_id: asset.tenant_id,
    schema_version: asset.schema_version,
    ...fields,
    created_at: asset.created_at,
    updated_at: syncedAt,
    synced_at: syncedAt,
    synced_by: syncedAt ? asset.modified_by : null,
  });
}

export function userToResponse(user: User): UserResponse {
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at.toISOString(),
  };
}
