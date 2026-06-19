import { getTenantId } from "../context/authContext.js";
import { getMongoDb } from "../mongo.js";
import type { Asset } from "../types.js";

const COLLECTION = "assets";

interface AssetDocument {
  _id: string;
  tenant_id: string;
  status: string;
  data: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  synced_at: Date;
}

function fromDocument(doc: AssetDocument): Asset {
  return {
    id: doc._id,
    tenant_id: doc.tenant_id,
    status: doc.status,
    data: doc.data,
    created_by: doc.created_by,
    created_at: doc.created_at,
  };
}

// Read path: assets are served from MongoDB (the synced copy). Mongo has no
// row-level security, so every read is explicitly scoped to the caller's tenant
// using the tenant id from the request context.
export async function findAssetDocuments(): Promise<Asset[]> {
  const tenantId = getTenantId();
  const db = await getMongoDb();

  const docs = await db
    .collection<AssetDocument>(COLLECTION)
    .find({ tenant_id: tenantId })
    .sort({ created_at: -1 })
    .toArray();

  return docs.map(fromDocument);
}

export async function findAssetDocumentById(id: string): Promise<Asset | null> {
  const tenantId = getTenantId();
  const db = await getMongoDb();

  const doc = await db
    .collection<AssetDocument>(COLLECTION)
    .findOne({ _id: id, tenant_id: tenantId });

  return doc ? fromDocument(doc) : null;
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

  await db.collection<AssetDocument>(COLLECTION).updateOne(
    { _id: asset.id },
    {
      $set: {
        tenant_id: asset.tenant_id,
        status: asset.status,
        data: asset.data,
        created_by: asset.created_by,
        created_at: asset.created_at,
        synced_at: new Date(),
      },
    },
    { upsert: true }
  );
}
