import type { MongoAssetRecord } from "../api/assetResponse.js";
import { getTenantId } from "../context/authContext.js";
import { getMongoDb } from "../clients/mongo.js";
import type { AssetFilter } from "../schemas.js";
import type { Asset } from "../types.js";

const COLLECTION = "assets";

// Static validator: default asset keys only. extra_fields contents are not checked.
const ASSET_COLLECTION_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "tenant_id",
      "schema_version",
      "name",
      "type",
      "status",
      "lat",
      "lng",
      "installed_at",
      "extra_fields",
      "created_at",
      "updated_at",
    ],
    properties: {
      _id: { bsonType: "string" },
      tenant_id: { bsonType: "string" },
      schema_version: { bsonType: ["int", "long", "double"] },
      name: { bsonType: "string", minLength: 1 },
      type: { bsonType: "string", minLength: 1 },
      status: {
        bsonType: ["string", "null"],
        enum: ["ok", "warning", "critical", null],
      },
      lat: { bsonType: ["double", "int", "long", "null"] },
      lng: { bsonType: ["double", "int", "long", "null"] },
      installed_at: { bsonType: ["string", "null"] },
      extra_fields: { bsonType: "object" },
      created_at: { bsonType: "date" },
      updated_at: { bsonType: "date" },
    },
    additionalProperties: false,
  },
};

interface AssetDocument extends MongoAssetRecord {
  _id: string; // same UUID as Postgres assets.id
}

type MutableAssetFields = Pick<
  AssetDocument,
  "name" | "type" | "status" | "lat" | "lng" | "installed_at" | "extra_fields" | "updated_at"
>;

async function ensureAssetCollectionValidator(): Promise<void> {
  const db = await getMongoDb();
  const collections = await db
    .listCollections({ name: COLLECTION }, { nameOnly: true })
    .toArray();

  if (collections.length === 0) {
    await db.createCollection(COLLECTION, {
      validator: ASSET_COLLECTION_VALIDATOR,
      validationLevel: "strict",
      validationAction: "error",
    });
    return;
  }

  await db.command({
    collMod: COLLECTION,
    validator: ASSET_COLLECTION_VALIDATOR,
    validationLevel: "strict",
    validationAction: "error",
  });
}

export async function ensureAssetIndexes(): Promise<void> {
  await ensureAssetCollectionValidator();

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

function toDocument(asset: Asset): AssetDocument {
  const data = asset.data;

  return {
    _id: asset.id,
    tenant_id: asset.tenant_id,
    schema_version: asset.schema_version,
    name: typeof data.name === "string" ? data.name : "",
    type: typeof data.type === "string" ? data.type : "",
    status: typeof data.status === "string" ? data.status : null,
    lat: typeof data.lat === "number" ? data.lat : null,
    lng: typeof data.lng === "number" ? data.lng : null,
    installed_at: typeof data.installed_at === "string" ? data.installed_at : null,
    extra_fields: asRecord(data.extra_fields),
    created_at: asset.created_at,
    updated_at: new Date(),
  };
}

function toMutableFields(doc: AssetDocument): MutableAssetFields {
  return {
    name: doc.name,
    type: doc.type,
    status: doc.status,
    lat: doc.lat,
    lng: doc.lng,
    installed_at: doc.installed_at,
    extra_fields: doc.extra_fields,
    updated_at: doc.updated_at,
  };
}

function toRecord(doc: AssetDocument): MongoAssetRecord {
  const { _id, ...record } = doc;
  void _id;
  return record;
}

export async function findAssetDocuments(
  filter: AssetFilter
): Promise<{ rows: Array<{ id: string; record: MongoAssetRecord }>; total: number }> {
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

  return {
    rows: docs.map((doc) => ({ id: doc._id, record: toRecord(doc) })),
    total,
  };
}

export async function aggregateAssetStatusCounts(
  tenantId: string
): Promise<Array<{ status: string | null; count: number }>> {
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

export async function aggregateAssetSchemaVersionCounts(
  tenantId: string
): Promise<Array<{ schema_version: number; count: number }>> {
  const db = await getMongoDb();

  const results = await db
    .collection<AssetDocument>(COLLECTION)
    .aggregate<{ _id: number; count: number }>([
      { $match: { tenant_id: tenantId } },
      { $group: { _id: "$schema_version", count: { $sum: 1 } } },
    ])
    .toArray();

  return results.map((row) => ({ schema_version: row._id, count: row.count }));
}

export async function countTenantAssets(tenantId: string): Promise<number> {
  const db = await getMongoDb();
  return db.collection<AssetDocument>(COLLECTION).countDocuments({ tenant_id: tenantId });
}

export async function findAssetDocumentById(
  id: string
): Promise<{ id: string; record: MongoAssetRecord } | null> {
  const tenantId = getTenantId();
  const db = await getMongoDb();

  const doc = await db
    .collection<AssetDocument>(COLLECTION)
    .findOne({ _id: id, tenant_id: tenantId });

  return doc ? { id: doc._id, record: toRecord(doc) } : null;
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
  const doc = toDocument(asset);
  const collection = db.collection<AssetDocument>(COLLECTION);

  const existing = await collection.findOne({ _id: doc._id });

  if (existing) {
    if (existing.tenant_id !== doc.tenant_id) {
      throw new Error(
        `Mongo asset ${doc._id}: tenant_id is immutable (${existing.tenant_id} -> ${doc.tenant_id})`
      );
    }
    if (existing.schema_version !== doc.schema_version) {
      throw new Error(
        `Mongo asset ${doc._id}: schema_version is immutable (${existing.schema_version} -> ${doc.schema_version})`
      );
    }

    await collection.updateOne({ _id: doc._id }, { $set: toMutableFields(doc) });
    return;
  }

  await collection.insertOne(doc);
}

export async function replaceAssetDocuments(assets: Asset[]): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection<AssetDocument>(COLLECTION);

  await collection.deleteMany({});
  if (assets.length > 0) {
    await collection.insertMany(assets.map(toDocument));
  }
}
