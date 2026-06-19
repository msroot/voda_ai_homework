import { getMongoDb } from "../mongo.js";
import type { Asset } from "../types.js";

interface AssetDocument {
  _id: string;
  tenant_id: string;
  status: string;
  data: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  synced_at: Date;
}

export async function upsertAssetDocument(asset: Asset): Promise<void> {
  const db = await getMongoDb();

  await db.collection<AssetDocument>("assets").updateOne(
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
