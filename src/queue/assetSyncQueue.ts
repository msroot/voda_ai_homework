import { Queue, type ConnectionOptions } from "bullmq";
import { createRedisConnection } from "../redis.js";

export const ASSET_SYNC_QUEUE = "asset-sync";
export const ASSET_SYNC_JOB = "sync";

export interface AssetSyncJobData {
  assetId: string;
  tenantId: string;
  userId: string;
}

// BullMQ bundles its own ioredis copy, so an ioredis instance is cast to the
// connection type it expects; at runtime it is a valid connection.
const queue = new Queue<AssetSyncJobData, void, string>(ASSET_SYNC_QUEUE, {
  connection: createRedisConnection() as unknown as ConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    // Remove on terminal states so the outbox poll can re-enqueue a row if it
    // is still "pending" later (auto-recovery for transient failures).
    removeOnComplete: true,
    removeOnFail: true,
  },
});

// jobId = assetId makes enqueue idempotent: while a sync for an asset is still
// in flight, repeated poll ticks won't create duplicate jobs.
export async function enqueueAssetSync(data: AssetSyncJobData): Promise<void> {
  await queue.add(ASSET_SYNC_JOB, data, { jobId: data.assetId });
}
