import { getTenantId } from "../context/authContext.js";
import { getMongoDb } from "../mongo.js";
import type { AssetFilter } from "../schemas.js";
import type { Asset } from "../types.js";

const COLLECTION = "assets";

export interface AssetLocation {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

// The base asset fields map to dedicated document fields; lat/lng become the
// GeoJSON `location`. Only tenant-defined extension fields (the asset's
// extra_fields) land in the polymorphic custom_fields bucket.
export interface AssetDocument {
  _id: string; // mirrors asset_id, keeps the upsert idempotent
  asset_id: string; // relational pointer to the PostgreSQL UUID
  tenant_id: string; // data isolation partition boundary
  name: string;
  type: string;
  status: string | null;
  location: AssetLocation | null;
  installed_at: string | null;
  custom_fields: Record<string, unknown>; // tenant-defined extension fields
  created_at: Date;
  updated_at: Date;
}

export type AssetView = Omit<AssetDocument, "_id">;

// Mongo reads are always tenant-scoped, so each index leads with tenant_id.
// _id (= asset_id) is covered by the default index, serving find-by-id, upsert
// and delete.
export async function ensureAssetIndexes(): Promise<void> {
  const db = await getMongoDb();
  await db.collection<AssetDocument>(COLLECTION).createIndexes([
    { key: { tenant_id: 1, created_at: -1 }, name: "tenant_created_at" },
    { key: { tenant_id: 1, type: 1 }, name: "tenant_type" },
    { key: { tenant_id: 1, status: 1 }, name: "tenant_status" },
  ]);
}

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

  return {
    _id: asset.id,
    asset_id: asset.id,
    tenant_id: asset.tenant_id,
    name: typeof data.name === "string" ? data.name : "",
    type: typeof data.type === "string" ? data.type : "",
    status: typeof data.status === "string" ? data.status : null,
    location: buildLocation(data),
    installed_at: typeof data.installed_at === "string" ? data.installed_at : null,
    custom_fields: asRecord(data.extra_fields),
    created_at: asset.created_at,
    updated_at: new Date(),
  };
}

function toView(doc: AssetDocument): AssetView {
  const { _id, ...view } = doc;
  void _id;
  return view;
}

// Read path: assets are served from MongoDB (the synced copy). Mongo has no
// row-level security, so every read is explicitly scoped to the caller's tenant
// using the tenant id from the request context. `type` and `status` are
// top-level document fields.
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
    queryFilter.status = filter.status;
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
export async function aggregateAssetStatusCounts(
  tenantId: string
): Promise<AssetStatusCount[]> {
  const db = await getMongoDb();

  const results = await db
    .collection<AssetDocument>(COLLECTION)
    .aggregate<{ _id: string | null; count: number }>([
      { $match: { tenant_id: tenantId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
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

// Seeding: replace the whole collection with the seed set in one pass.
export async function replaceAssetDocuments(assets: Asset[]): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection<AssetDocument>(COLLECTION);

  await collection.deleteMany({});
  if (assets.length > 0) {
    await collection.insertMany(assets.map(toDocument));
  }
}
