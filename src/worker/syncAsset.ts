import { Queue, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "../clients/redis.js";

export const SYNC_ASSET_QUEUE = "sync-asset";
const SYNC_ASSET_JOB = "sync";

export interface SyncAssetJobData {
  assetId: string;
  tenantId: string;
  userId: string;
}

const queue = new Queue<SyncAssetJobData, void, string>(SYNC_ASSET_QUEUE, {
  connection: createRedisConnection() as unknown as ConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function enqueueSyncAsset(data: SyncAssetJobData): Promise<void> {
  await queue.add(SYNC_ASSET_JOB, data, { jobId: data.assetId });
}
