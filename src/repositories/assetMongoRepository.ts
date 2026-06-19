import { getTenantId } from "../context/authContext.js";
import { getMongoDb } from "../mongo.js";
import type { Asset } from "../types.js";

const COLLECTION = "assets";

// Base fields that get promoted to dedicated document fields. Everything else
// in the asset data (status, installed_at, ...) plus extra_fields lands in the
// polymorphic custom_fields bucket.
const PROMOTED_FIELDS = new Set([
  "id",
  "tenant_id",
  "name",
  "type",
  "lat",
  "lng",
  "extra_fields",
]);

export interface AssetLocation {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface AssetDocument {
  _id: string; // mirrors asset_id, keeps the upsert idempotent
  asset_id: string; // relational pointer to the PostgreSQL UUID
  tenant_id: string; // data isolation partition boundary
  name: string;
  type: string;
  location: AssetLocation | null;
  custom_fields: Record<string, unknown>; // polymorphic bucket for extensions
  created_at: Date;
  updated_at: Date;
}

export type AssetView = Omit<AssetDocument, "_id">;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildLocation(data: Record<string, unknown>): AssetLocation | null {
  const { lng, lat } = data;
  if (typeof lng === "number" && typeof lat === "number") {
    return { type: "Point", coordinates: [lng, lat] };
  }
  return null;
}

function toDocument(asset: Asset): AssetDocument {
  const data = asset.data;

  const customFields: Record<string, unknown> = { ...asRecord(data.extra_fields) };
  for (const [key, value] of Object.entries(data)) {
    if (!PROMOTED_FIELDS.has(key)) {
      customFields[key] = value;
    }
  }

  return {
    _id: asset.id,
    asset_id: asset.id,
    tenant_id: asset.tenant_id,
    name: typeof data.name === "string" ? data.name : "",
    type: typeof data.type === "string" ? data.type : "",
    location: buildLocation(data),
    custom_fields: customFields,
    created_at: asset.created_at,
    updated_at: new Date(),
  };
}

function toView(doc: AssetDocument): AssetView {
  const { _id, ...view } = doc;
  void _id;
  return view;
}

export interface AssetFilter {
  type?: string;
  status?: string;
  limit: number;
  offset: number;
}

// Read path: assets are served from MongoDB (the synced copy). Mongo has no
// row-level security, so every read is explicitly scoped to the caller's tenant
// using the tenant id from the request context. `type` is a top-level field;
// `status` lives inside the custom_fields bucket.
export async function findAssetDocuments(
  filter: AssetFilter
): Promise<{ rows: AssetView[]; total: number }> {
  const tenantId = getTenantId();
  const db = await getMongoDb();

  const queryFilter: Record<string, unknown> = { tenant_id: tenantId };
  if (filter.type) {
    queryFilter.type = filter.type;
  }
  if (filter.status) {
    queryFilter["custom_fields.status"] = filter.status;
  }

  const collection = db.collection<AssetDocument>(COLLECTION);
  const total = await collection.countDocuments(queryFilter);

  const docs = await collection
    .find(queryFilter)
    .sort({ created_at: -1 })
    .skip(filter.offset)
    .limit(filter.limit)
    .toArray();

  return { rows: docs.map(toView), total };
}

export interface AssetStatusCount {
  status: string | null;
  count: number;
}

// Cross-store report input: asset counts grouped by business status for one
// tenant, read from MongoDB. Tenant isolation is enforced via the $match.
// `status` lives inside the custom_fields bucket.
export async function aggregateAssetStatusCounts(
  tenantId: string
): Promise<AssetStatusCount[]> {
  const db = await getMongoDb();

  const results = await db
    .collection<AssetDocument>(COLLECTION)
    .aggregate<{ _id: string | null; count: number }>([
      { $match: { tenant_id: tenantId } },
      { $group: { _id: "$custom_fields.status", count: { $sum: 1 } } },
    ])
    .toArray();

  return results.map((row) => ({ status: row._id, count: row.count }));
}

export async function findAssetDocumentById(
  id: string
): Promise<AssetView | null> {
  const tenantId = getTenantId();
  const db = await getMongoDb();

  const doc = await db
    .collection<AssetDocument>(COLLECTION)
    .findOne({ _id: id, tenant_id: tenantId });

  return doc ? toView(doc) : null;
}

export async function deleteAssetDocument(id: string): Promise<void> {
  const tenantId = getTenantId();
  const db = await getMongoDb();

  await db
    .collection<AssetDocument>(COLLECTION)
    .deleteOne({ _id: id, tenant_id: tenantId });
}

export async function upsertAssetDocument(asset: Asset): Promise<void> {
  const db = await getMongoDb();
  const { _id, ...fields } = toDocument(asset);

  await db
    .collection<AssetDocument>(COLLECTION)
    .updateOne({ _id }, { $set: fields }, { upsert: true });
}
