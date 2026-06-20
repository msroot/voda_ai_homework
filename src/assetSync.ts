import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "./clients/redis.js";
import { invalidateTenantAssets } from "./cache.js";
import { runWithAuthContext } from "./auth.js";
import {
  findAssetById,
  hardDeleteAsset,
  markAssetSynced,
} from "./repositories/assetRepository.js";
import {
  deleteAssetDocument,
  upsertAssetDocument,
} from "./repositories/assetMongoRepository.js";

export const ASSET_SYNC_QUEUE = "asset-sync";
const ASSET_SYNC_JOB = "sync";

export interface AssetSyncJobData {
  assetId: string;
  tenantId: string;
  userId: string;
}

const queue = new Queue<AssetSyncJobData, void, string>(ASSET_SYNC_QUEUE, {
  connection: createRedisConnection() as unknown as ConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function enqueueAssetSync(data: AssetSyncJobData): Promise<void> {
  await queue.add(ASSET_SYNC_JOB, data, { jobId: data.assetId });
}

export function createAssetSyncWorker(): Worker<AssetSyncJobData, void, string> {
  const worker = new Worker<AssetSyncJobData, void, string>(
    ASSET_SYNC_QUEUE,
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
          await upsertAssetDocument(asset);
          await markAssetSynced(assetId);
        }
      });

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
