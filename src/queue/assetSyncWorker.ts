import { Worker, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "../redis.js";
import { runWithAuthContext } from "../context/authContext.js";
import {
  findAssetById,
  hardDeleteAsset,
  markAssetSynced,
} from "../repositories/assetRepository.js";
import {
  deleteAssetDocument,
  upsertAssetDocument,
} from "../repositories/assetMongoRepository.js";
import { invalidateTenantAssets } from "../cache/assetCache.js";
import { ASSET_SYNC_QUEUE, type AssetSyncJobData } from "./assetSyncQueue.js";

export function createAssetSyncWorker(): Worker<AssetSyncJobData, void, string> {
  const worker = new Worker<AssetSyncJobData, void, string>(
    ASSET_SYNC_QUEUE,
    async (job) => {
      const { assetId, tenantId, userId } = job.data;

      // Trusted system context: the sync worker acts on behalf of the tenant.
      // The job is only a trigger; the row's current `action` is the source of
      // truth (so the latest create/update/delete always wins).
      await runWithAuthContext({ userId, tenantId, role: "admin" }, async () => {
        const asset = await findAssetById(assetId);

        // Row already gone (e.g. a delete finalized on a previous attempt).
        if (!asset) {
          return;
        }

        if (asset.action === "delete") {
          // Clear the read model first, then drop the outbox row. If the second
          // step fails the row stays a 'pending' tombstone and is re-polled;
          // the Mongo delete is idempotent.
          await deleteAssetDocument(assetId);
          await hardDeleteAsset(assetId);
        } else {
          await upsertAssetDocument(asset);
          await markAssetSynced(assetId);
        }
      });

      // The read model now reflects the change; drop any cache that was
      // repopulated during the eventual-consistency window.
      await invalidateTenantAssets(tenantId);
    },
    { connection: createRedisConnection() as unknown as ConnectionOptions }
  );

  worker.on("completed", (job) => {
    console.log(`asset-sync job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`asset-sync job ${job?.id} failed:`, err.message);
  });

  return worker;
}
