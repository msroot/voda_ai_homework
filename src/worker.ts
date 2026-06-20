import "dotenv/config";
import { Worker, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "./clients/redis.js";
import { invalidateTenantAssets } from "./lib/cache.js";
import { runWithAuthContext } from "./lib/authContext.js";
import { closeMongo } from "./clients/mongo.js";
import {
  findAssetById,
  hardDeleteAsset,
  markAssetSynced,
} from "./repositories/assetRepository.js";
import {
  deleteAssetDocument,
  ensureAssetIndexes,
  upsertAssetDocument,
} from "./repositories/assetMongoRepository.js";
import { SYNC_ASSET_QUEUE, type SyncAssetJobData } from "./worker/syncAsset.js";

ensureAssetIndexes().catch((err) => {
  console.error("Failed to ensure Mongo asset indexes:", err);
});

const worker = new Worker<SyncAssetJobData, void, string>(
  SYNC_ASSET_QUEUE,
  async (job) => {
    const { assetId, tenantId, userId } = job.data;

    await runWithAuthContext({ userId, tenantId, role: "admin" }, async () => {
      const asset = await findAssetById(assetId);

      if (!asset) {
        return;
      }

      if (asset.action === "delete") {
        await deleteAssetDocument(assetId);
        await hardDeleteAsset(assetId);
      } else {
        await upsertAssetDocument(asset, userId);
        await markAssetSynced(assetId);
      }
    });

    await invalidateTenantAssets(tenantId);
  },
  { connection: createRedisConnection() as unknown as ConnectionOptions }
);

worker.on("completed", (job) => {
  console.log(`sync-asset job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`sync-asset job ${job?.id} failed:`, err.message);
});

console.log("Sync asset worker started");

async function shutdown() {
  await worker.close();
  await closeMongo();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
