import { Worker, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "../redis.js";
import { runWithAuthContext } from "../context/authContext.js";
import {
  findAssetById,
  markAssetSynced,
} from "../repositories/assetRepository.js";
import { upsertAssetDocument } from "../repositories/assetMongoRepository.js";
import { invalidateTenantAssets } from "../cache/assetCache.js";
import { ASSET_SYNC_QUEUE, type AssetSyncJobData } from "./assetSyncQueue.js";

export function createAssetSyncWorker(): Worker<AssetSyncJobData, void, string> {
  const worker = new Worker<AssetSyncJobData, void, string>(
    ASSET_SYNC_QUEUE,
    async (job) => {
      const { assetId, tenantId, userId } = job.data;

      await runWithAuthContext({ userId, tenantId }, async () => {
        const asset = await findAssetById(assetId);
        if (!asset) {
          throw new Error(`Asset ${assetId} not found for tenant ${tenantId}`);
        }

        await upsertAssetDocument(asset);
        await markAssetSynced(assetId);
      });

      // The asset is now in Mongo; drop any cache that was repopulated with the
      // pre-sync view during the eventual-consistency window.
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
