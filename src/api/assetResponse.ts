import type { Asset } from "../types.js";

/** Public asset shape returned by every asset endpoint (create, update, get, list). */
export interface AssetResponse {
  id: string;
  tenant_id: string;
  schema_version: number;
  name: string;
  type: string;
  status: string;
  lat: number | null;
  lng: number | null;
  installed_at: string | null;
  extra_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
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
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function assetRecordToResponse(
  id: string,
  record: MongoAssetRecord
): AssetResponse {
  return {
    id,
    tenant_id: record.tenant_id,
    schema_version: record.schema_version,
    name: record.name,
    type: record.type,
    status: record.status ?? "",
    lat: record.lat,
    lng: record.lng,
    installed_at: record.installed_at,
    extra_fields: record.extra_fields,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

export function postgresAssetToResponse(asset: Asset): AssetResponse {
  const data = asset.data;

  return {
    id: asset.id,
    tenant_id: asset.tenant_id,
    schema_version: asset.schema_version,
    name: typeof data.name === "string" ? data.name : "",
    type: typeof data.type === "string" ? data.type : "",
    status: typeof data.status === "string" ? data.status : "",
    lat: typeof data.lat === "number" ? data.lat : null,
    lng: typeof data.lng === "number" ? data.lng : null,
    installed_at: typeof data.installed_at === "string" ? data.installed_at : null,
    extra_fields: asRecord(data.extra_fields),
    created_at: asset.created_at.toISOString(),
    updated_at: null,
  };
}
